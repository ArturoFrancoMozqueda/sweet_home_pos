from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
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


async def _calculate_shift_totals(shift_id: int, db: AsyncSession) -> tuple[float, float]:
    cash_sales, transfer_sales = await _calculate_shift_totals(shift_id, db)
    return cash_sales, transfer_sales


def _shift_to_response(
    shift: Shift,
    *,
    cash_sales: float | None = None,
    transfer_sales: float | None = None,
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
        expected_cash=expected_cash if expected_cash is not None else (float(shift.expected_cash) if shift.expected_cash is not None else None),
        cash_sales=cash_sales if cash_sales is not None else (float(shift.cash_sales) if shift.cash_sales is not None else None),
        transfer_sales=transfer_sales if transfer_sales is not None else (float(shift.transfer_sales) if shift.transfer_sales is not None else None),
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
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift, attribute_names=["user"])
    return _shift_to_response(
        shift,
        cash_sales=0.0,
        transfer_sales=0.0,
        expected_cash=float(shift.opening_cash),
    )


@router.post("/{shift_id}/close", response_model=ShiftResponse)
async def close_shift(
    shift_id: int,
    data: ShiftClose,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Shift).where(Shift.id == shift_id)
    )
    shift = result.scalars().first()
    if not shift:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if shift.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No puedes cerrar el turno de otro usuario")
    if shift.closed_at:
        raise HTTPException(status_code=400, detail="Este turno ya está cerrado")

    # Calculate sales totals for this shift — sum from SalePayment so split
    # payments (part cash / part transfer) contribute correctly to each bucket.
    cash_result = await db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, SalePayment.sale_id == Sale.id)
        .where(
            Sale.shift_id == shift_id,
            SalePayment.method == "efectivo",
            Sale.cancelled == False,  # noqa: E712
        )
    )
    cash_sales = float(cash_result.scalar())

    transfer_result = await db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, SalePayment.sale_id == Sale.id)
        .where(
            Sale.shift_id == shift_id,
            SalePayment.method == "transferencia",
            Sale.cancelled == False,  # noqa: E712
        )
    )
    transfer_sales = float(transfer_result.scalar())

    expected_cash = float(shift.opening_cash) + cash_sales
    variance = data.closing_cash - expected_cash

    shift.closed_at = datetime.utcnow()
    shift.closing_cash = data.closing_cash
    shift.cash_sales = cash_sales
    shift.transfer_sales = transfer_sales
    shift.expected_cash = expected_cash
    shift.variance = variance
    shift.notes = data.notes

    await db.commit()
    await db.refresh(shift, attribute_names=["user"])
    return _shift_to_response(
        shift,
        cash_sales=cash_sales,
        transfer_sales=transfer_sales,
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
    cash_sales, transfer_sales = await _calculate_shift_totals(shift.id, db)
    expected_cash = float(shift.opening_cash) + cash_sales
    return _shift_to_response(
        shift,
        cash_sales=cash_sales,
        transfer_sales=transfer_sales,
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
    from datetime import timezone
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    from app.config import settings

    query = select(Shift).order_by(Shift.opened_at.desc())

    if user_id:
        query = query.where(Shift.user_id == user_id)

    tz = ZoneInfo(settings.timezone)
    if date_from:
        from datetime import timezone as tz_mod
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=tz)
        start = start.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.where(Shift.opened_at >= start)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=tz, hour=23, minute=59, second=59)
        end = end.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.where(Shift.opened_at <= end)

    query = query.limit(50)
    result = await db.execute(query)
    shifts = result.scalars().all()

    responses = []
    for s in shifts:
        await db.refresh(s, attribute_names=["user"])
        responses.append(_shift_to_response(s))
    return responses
