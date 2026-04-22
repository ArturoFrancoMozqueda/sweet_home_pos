from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from app.config import settings
from app.database import get_db
from app.models.order import Order
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.order import OrderCreate, OrderResponse, OrderUpdate

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _to_response(order: Order) -> OrderResponse:
    balance_due = max(0.0, float(order.total_amount) - float(order.deposit_amount))
    return OrderResponse(
        id=order.id,
        user_id=order.user_id,
        username=order.user.username,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        pickup_at=order.pickup_at,
        status=order.status,
        total_amount=float(order.total_amount),
        deposit_amount=float(order.deposit_amount),
        balance_due=balance_due,
        notes=order.notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    status: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    limit: int = Query(100, ge=1, le=300),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).order_by(Order.pickup_at.asc(), Order.created_at.desc())
    if current_user.role != "admin":
        query = query.where(Order.user_id == current_user.id)
    if status:
        query = query.where(Order.status == status)

    tz = ZoneInfo(settings.timezone)
    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=tz)
        query = query.where(Order.pickup_at >= start.astimezone(timezone.utc).replace(tzinfo=None))
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(
            tzinfo=tz, hour=23, minute=59, second=59
        )
        query = query.where(Order.pickup_at <= end.astimezone(timezone.utc).replace(tzinfo=None))

    result = await db.execute(query.limit(limit))
    orders = result.scalars().all()
    for order in orders:
        await db.refresh(order, attribute_names=["user"])
    return [_to_response(order) for order in orders]


@router.post("", response_model=OrderResponse, status_code=201)
async def create_order(
    data: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.deposit_amount > data.total_amount:
        raise HTTPException(status_code=400, detail="El anticipo no puede exceder el total")

    order = Order(
        user_id=current_user.id,
        customer_name=data.customer_name.strip(),
        customer_phone=(data.customer_phone or "").strip() or None,
        pickup_at=data.pickup_at.replace(tzinfo=None),
        status=data.status,
        total_amount=data.total_amount,
        deposit_amount=data.deposit_amount,
        notes=(data.notes or "").strip() or None,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order, attribute_names=["user"])
    return _to_response(order)


@router.put("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: int,
    data: OrderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes editar este pedido")

    payload = data.model_dump(exclude_unset=True)
    if "deposit_amount" in payload and payload["deposit_amount"] is not None:
        next_deposit = payload["deposit_amount"]
    else:
        next_deposit = float(order.deposit_amount)
    if "total_amount" in payload and payload["total_amount"] is not None:
        next_total = payload["total_amount"]
    else:
        next_total = float(order.total_amount)
    if next_deposit > next_total:
        raise HTTPException(status_code=400, detail="El anticipo no puede exceder el total")

    for field, value in payload.items():
        if field == "pickup_at" and value is not None:
            setattr(order, field, value.replace(tzinfo=None))
        elif field in {"customer_name", "customer_phone", "notes"}:
            setattr(order, field, (value or "").strip() or None)
        else:
            setattr(order, field, value)

    await db.commit()
    await db.refresh(order, attribute_names=["user"])
    return _to_response(order)
