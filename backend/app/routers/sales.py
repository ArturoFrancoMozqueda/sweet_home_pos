from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from app.config import settings
from app.database import get_db
from app.models.product import Product
from app.models.sale import Sale, SaleItem, SalePayment
from app.models.shift import Shift
from app.models.user import User
from app.routers.auth import get_current_user, require_admin
from app.schemas.sale import SaleCreate, SalePaymentCreate, SaleResponse


class CancelSaleRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


def resolve_payments(data: SaleCreate) -> list[SalePaymentCreate]:
    """Normalize payments from a SaleCreate, supporting old single-method clients.

    Returns the validated list; raises ValueError if the invariants fail:
      - payments sum must equal total (±0.01)
      - items sum minus discount must equal total (±0.01)
    """
    if data.payments and len(data.payments) > 0:
        payments = data.payments
    elif data.payment_method in ("efectivo", "transferencia"):
        payments = [SalePaymentCreate(method=data.payment_method, amount=data.total)]
    else:
        raise ValueError("Se requiere al menos un método de pago")

    payments_sum = sum(p.amount for p in payments)
    if abs(payments_sum - data.total) > 0.01:
        raise ValueError(
            f"Suma de pagos ({payments_sum:.2f}) no coincide con el total ({data.total:.2f})"
        )

    items_sum = sum(item.subtotal for item in data.items)
    expected_total = items_sum - data.discount_amount
    if abs(expected_total - data.total) > 0.01:
        raise ValueError(
            f"Total no coincide con items - descuento "
            f"(esperado: {expected_total:.2f}, recibido: {data.total:.2f})"
        )
    return payments


def derive_payment_method(payments: list[SalePaymentCreate]) -> str:
    if len(payments) == 1:
        return payments[0].method
    return "mixto"


router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.post("", response_model=SaleResponse, status_code=201)
async def create_sale(
    data: SaleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Sale).where(Sale.client_uuid == data.client_uuid))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Venta ya registrada")

    try:
        payments = resolve_payments(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Find user's current open shift
    shift_result = await db.execute(
        select(Shift).where(Shift.user_id == current_user.id, Shift.closed_at.is_(None))
    )
    current_shift = shift_result.scalars().first()
    if not current_shift:
        raise HTTPException(
            status_code=400,
            detail="Necesitas un turno abierto antes de registrar ventas",
        )

    sale = Sale(
        client_uuid=data.client_uuid,
        total=data.total,
        discount_amount=data.discount_amount,
        payment_method=derive_payment_method(payments),
        created_at=data.created_at.replace(tzinfo=None),
        synced_at=datetime.utcnow(),
        user_id=current_user.id,
        shift_id=current_shift.id if current_shift else None,
    )

    for p in payments:
        sale.payments.append(SalePayment(method=p.method, amount=p.amount))

    for item_data in data.items:
        sale.items.append(SaleItem(
            product_id=item_data.product_id,
            product_name=item_data.product_name,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            subtotal=item_data.subtotal,
        ))
        result = await db.execute(
            select(Product).where(Product.id == item_data.product_id).with_for_update()
        )
        product = result.scalars().first()
        if product:
            if product.stock < item_data.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente para {item_data.product_name}",
                )
            product.stock -= item_data.quantity

    db.add(sale)
    await db.commit()
    await db.refresh(sale, attribute_names=["items", "payments"])
    return sale


@router.get("", response_model=list[SaleResponse])
async def get_sales(
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    include_cancelled: bool = Query(False, description="Include cancelled sales (admin only)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Sale)
        .options(selectinload(Sale.items))
        .order_by(Sale.created_at.desc())
    )
    # Only admins may view cancelled sales; employees always see active-only.
    if not (include_cancelled and current_user.role == "admin"):
        query = query.where(Sale.cancelled == False)  # noqa: E712

    # Employees only see their own sales, but the UI date filters should still work.
    if current_user.role == "employee":
        query = query.where(Sale.user_id == current_user.id)

    tz = ZoneInfo(settings.timezone)
    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=tz)
        start = start.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.where(Sale.created_at >= start)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=tz, hour=23, minute=59, second=59)
        end = end.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.where(Sale.created_at <= end)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/count")
async def get_sales_count(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tz = ZoneInfo(settings.timezone)
    query = select(func.count(Sale.id)).where(Sale.cancelled == False)  # noqa: E712

    if current_user.role == "employee":
        query = query.where(Sale.user_id == current_user.id)

    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=tz)
        start = start.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.where(Sale.created_at >= start)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=tz, hour=23, minute=59, second=59)
        end = end.astimezone(timezone.utc).replace(tzinfo=None)
        query = query.where(Sale.created_at <= end)

    result = await db.execute(query)
    return {"count": result.scalar()}


@router.delete("/{sale_id}", status_code=204)
async def cancel_sale(
    sale_id: int,
    body: CancelSaleRequest | None = Body(None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
    )
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if sale.cancelled:
        raise HTTPException(status_code=400, detail="La venta ya fue cancelada")
    sale.cancelled = True
    sale.cancelled_at = datetime.utcnow()
    sale.cancelled_by_user_id = current_user.id
    reason = (body.reason if body else None) or None
    sale.cancellation_reason = reason.strip() if reason else None
    for item in sale.items:
        prod = (
            await db.execute(select(Product).where(Product.id == item.product_id).with_for_update())
        ).scalars().first()
        if prod:
            prod.stock += item.quantity
    await db.commit()
