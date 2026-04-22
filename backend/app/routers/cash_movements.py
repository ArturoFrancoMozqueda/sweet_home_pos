from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cash_movement import CashMovement
from app.models.shift import Shift
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.cash_movement import CashMovementCreate, CashMovementResponse

router = APIRouter(prefix="/api/cash-movements", tags=["cash_movements"])


def _to_response(movement: CashMovement) -> CashMovementResponse:
    return CashMovementResponse(
        id=movement.id,
        user_id=movement.user_id,
        username=movement.user.username,
        shift_id=movement.shift_id,
        movement_type=movement.movement_type,
        amount=float(movement.amount),
        reason=movement.reason,
        notes=movement.notes,
        created_at=movement.created_at,
    )


async def _get_open_shift(user_id: int, db: AsyncSession) -> Shift | None:
    result = await db.execute(
        select(Shift).where(Shift.user_id == user_id, Shift.closed_at.is_(None))
    )
    return result.scalars().first()


@router.get("", response_model=list[CashMovementResponse])
async def list_cash_movements(
    shift_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(CashMovement).order_by(CashMovement.created_at.desc())
    if shift_id:
        query = query.where(CashMovement.shift_id == shift_id)
    elif current_user.role != "admin":
        open_shift = await _get_open_shift(current_user.id, db)
        if not open_shift:
            return []
        query = query.where(CashMovement.shift_id == open_shift.id)

    if current_user.role != "admin":
        query = query.where(CashMovement.user_id == current_user.id)

    result = await db.execute(query.limit(100))
    movements = result.scalars().all()
    for movement in movements:
        await db.refresh(movement, attribute_names=["user"])
    return [_to_response(movement) for movement in movements]


@router.post("", response_model=CashMovementResponse, status_code=201)
async def create_cash_movement(
    data: CashMovementCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    shift = await _get_open_shift(current_user.id, db)
    if not shift:
        raise HTTPException(status_code=400, detail="Necesitas un turno abierto para mover caja")

    movement = CashMovement(
        user_id=current_user.id,
        shift_id=shift.id,
        movement_type=data.movement_type,
        amount=data.amount,
        reason=data.reason.strip(),
        notes=(data.notes or "").strip() or None,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(movement, attribute_names=["user"])
    return _to_response(movement)
