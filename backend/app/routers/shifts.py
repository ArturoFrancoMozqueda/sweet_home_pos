from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from app.config import settings
from app.database import get_db
from app.models.cash_movement import CashMovement
from app.models.sale import Sale, SalePayment
from app.models.shift import Shift
from app.models.user import User
from app.routers.auth import get_current_user, require_admin
from app.schemas.shift import ShiftClose, ShiftOpen, ShiftResponse

router = APIRouter(prefix="/api/shifts", tags=["shifts"])


async def _get_open_shift(user_id: int, db: AsyncSession) -> Shift | None:
    result = await db.execute(
        select(Shift).where(Shift.user_id == user_id, Shift.closed_at.is_(None))
    )
    return result.scalars().first()


async def _calculate_shift_totals(
    shift_id: int,
    db: AsyncSession,
) -> tuple[float, float, float, float]:
    cash_sales_result = await db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, SalePayment.sale_id == Sale.id)
        .where(
            Sale.shift_id == shift_id,
            SalePayment.method == "efectivo",
            Sale.cancelled == False,  # noqa: E712
        )
    )
    cash_sales = float(cash_sales_result.scalar())

    transfer_sales_result = await db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, SalePayment.sale_id == Sale.id)
        .where(
            Sale.shift_id == shift_id,
            SalePayment.method == "transferencia",
            Sale.cancelled == False,  # noqa: E712
        )
    )
    transfer_sales = float(transfer_sales_result.scalar())

    cash_in_result = await db.execute(
        select(func.coalesce(func.sum(CashMovement.amount), 0)).where(
            CashMovement.shift_id == shift_id,
            CashMovement.movement_type == "in",
        )
    )
    cash_in = float(cash_in_result.scalar())

    cash_out_result = await db.execute(
        select(func.coalesce(func.sum(CashMovement.amount), 0)).where(
            CashMovement.shift_id == shift_id,
            CashMovement.movement_type == "out",
        )
    )
    cash_out = float(cash_out_result.scalar())

    return cash_sales, transfer_sales, cash_in, cash_out


def _shift_to_response(
    shift: Shift,
    *,
    cash_sales: float | None = None,
    transfer_sales: float | None = None,
    cash_in: float | None = None,
    cash_out: float | None = None,
    expected_cash: float | None = None,
) -> ShiftResponse:
    return ShiftResponse(
        id=shift.id,
        user_id=shift.user_id,
        username=shift.user.username,
        opened_at=shift.opened_at,
        closed_at=shift.closed_at,
        opening_cash=float(shift.opening_cash),
        closing_cash=float(shift.closing_cash) if shift.closing_cash is not None else None,
        expected_cash=(
            expected_cash
            if expected_cash is not None
            else (float(shift.expected_cash) if shift.expected_cash is not None else None)
        ),
        cash_sales=(
            cash_sales
            if cash_sales is not None
            else (float(shift.cash_sales) if shift.cash_sales is not None else None)
        ),
        transfer_sales=(
            transfer_sales
            if transfer_sales is not None
            else (float(shift.transfer_sales) if shift.transfer_sales is not None else None)
        ),
        cash_in=(
            cash_in if cash_in is not None else (float(shift.cash_in) if shift.cash_in is not None else None)
        ),
        cash_out=(
            cash_out if cash_out is not None else (float(shift.cash_out) if shift.cash_out is not None else None)
        ),
        variance=float(shift.variance) if shift.variance is not None else None,
        notes=shift.notes,
    )


@router.post("/open", response_model=ShiftResponse, status_code=201)
async def open_shift(
    data: ShiftOpen,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await _get_open_shift(current_user.id, db)
    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes un turno abierto")

    shift = Shift(
        user_id=current_user.id,
        opened_at=datetime.utcnow(),
        opening_cash=data.opening_cash,
        cash_in=0,
        cash_out=0,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift, attribute_names=["user"])
    return _shift_to_response(
        shift,
        cash_sales=0.0,
        transfer_sales=0.0,
        cash_in=0.0,
        cash_out=0.0,
        expected_cash=float(shift.opening_cash),
    )


@router.post("/{shift_id}/close", response_model=ShiftResponse)
async def close_shift(
    shift_id: int,
    data: ShiftClose,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = result.scalars().first()
    if not shift:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if shift.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No puedes cerrar el turno de otro usuario")
    if shift.closed_at:
        raise HTTPException(status_code=400, detail="Este turno ya está cerrado")

    cash_sales, transfer_sales, cash_in, cash_out = await _calculate_shift_totals(shift_id, db)
    expected_cash = float(shift.opening_cash) + cash_sales + cash_in - cash_out
    variance = data.closing_cash - expected_cash

    shift.closed_at = datetime.utcnow()
    shift.closing_cash = data.closing_cash
    shift.cash_sales = cash_sales
    shift.transfer_sales = transfer_sales
    shift.cash_in = cash_in
    shift.cash_out = cash_out
    shift.expected_cash = expected_cash
    shift.variance = variance
    shift.notes = data.notes

    await db.commit()
    await db.refresh(shift, attribute_names=["user"])
    return _shift_to_response(
        shift,
        cash_sales=cash_sales,
        transfer_sales=transfer_sales,
        cash_in=cash_in,
        cash_out=cash_out,
        expected_cash=expected_cash,
    )


@router.get("/me/current", response_model=ShiftResponse | None)
async def get_current_shift(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    shift = await _get_open_shift(current_user.id, db)
    if not shift:
        return None
    await db.refresh(shift, attribute_names=["user"])
    cash_sales, transfer_sales, cash_in, cash_out = await _calculate_shift_totals(shift.id, db)
    expected_cash = float(shift.opening_cash) + cash_sales + cash_in - cash_out
    return _shift_to_response(
        shift,
        cash_sales=cash_sales,
        transfer_sales=transfer_sales,
        cash_in=cash_in,
        cash_out=cash_out,
        expected_cash=expected_cash,
    )


@router.get("", response_model=list[ShiftResponse])
async def list_shifts(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user_id: int | None = Query(None),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Shift).order_by(Shift.opened_at.desc())
    if user_id:
        query = query.where(Shift.user_id == user_id)

    tz = ZoneInfo(settings.timezone)
    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=tz)
        query = query.where(Shift.opened_at >= start.astimezone(timezone.utc).replace(tzinfo=None))
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(
            tzinfo=tz, hour=23, minute=59, second=59
        )
        query = query.where(Shift.opened_at <= end.astimezone(timezone.utc).replace(tzinfo=None))

    result = await db.execute(query.limit(50))
    shifts = result.scalars().all()

    responses: list[ShiftResponse] = []
    for shift in shifts:
        await db.refresh(shift, attribute_names=["user"])
        if shift.closed_at is None:
            cash_sales, transfer_sales, cash_in, cash_out = await _calculate_shift_totals(
                shift.id, db
            )
            expected_cash = float(shift.opening_cash) + cash_sales + cash_in - cash_out
            responses.append(
                _shift_to_response(
                    shift,
                    cash_sales=cash_sales,
                    transfer_sales=transfer_sales,
                    cash_in=cash_in,
                    cash_out=cash_out,
                    expected_cash=expected_cash,
                )
            )
        else:
            responses.append(_shift_to_response(shift))
    return responses
