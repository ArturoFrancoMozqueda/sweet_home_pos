from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.inventory_movement import InventoryMovement
from app.models.product import Product
from app.models.user import User
from app.routers.auth import require_admin
from app.schemas.inventory_movement import (
    InventoryMovementCreate,
    InventoryMovementResponse,
)

router = APIRouter(prefix="/api/inventory-movements", tags=["inventory_movements"])

POSITIVE_TYPES = {"purchase", "production", "adjustment_in"}
NEGATIVE_TYPES = {"waste", "breakage", "adjustment_out"}


def _to_response(movement: InventoryMovement) -> InventoryMovementResponse:
    return InventoryMovementResponse(
        id=movement.id,
        product_id=movement.product_id,
        product_name=movement.product.name,
        user_id=movement.user_id,
        username=movement.user.username,
        movement_type=movement.movement_type,
        quantity_delta=movement.quantity_delta,
        resulting_stock=movement.resulting_stock,
        reason=movement.reason,
        notes=movement.notes,
        created_at=movement.created_at,
    )


@router.get("", response_model=list[InventoryMovementResponse])
async def list_inventory_movements(
    product_id: int | None = Query(None),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(InventoryMovement).order_by(InventoryMovement.created_at.desc())
    if product_id:
        query = query.where(InventoryMovement.product_id == product_id)
    result = await db.execute(query.limit(150))
    movements = result.scalars().all()
    for movement in movements:
        await db.refresh(movement, attribute_names=["product", "user"])
    return [_to_response(movement) for movement in movements]


@router.post("", response_model=InventoryMovementResponse, status_code=201)
async def create_inventory_movement(
    data: InventoryMovementCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.id == data.product_id).with_for_update()
    )
    product = result.scalars().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if data.movement_type in POSITIVE_TYPES:
        quantity_delta = data.quantity
    elif data.movement_type in NEGATIVE_TYPES:
        quantity_delta = -data.quantity
    else:
        raise HTTPException(status_code=400, detail="Tipo de movimiento no soportado")

    new_stock = product.stock + quantity_delta
    if new_stock < 0:
        raise HTTPException(status_code=400, detail="El movimiento deja stock negativo")

    product.stock = new_stock
    movement = InventoryMovement(
        product_id=product.id,
        user_id=current_user.id,
        movement_type=data.movement_type,
        quantity_delta=quantity_delta,
        resulting_stock=new_stock,
        reason=data.reason.strip(),
        notes=(data.notes or "").strip() or None,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(movement, attribute_names=["product", "user"])
    return _to_response(movement)
