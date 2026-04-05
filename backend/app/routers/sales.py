from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
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
from app.models.sale import Sale, SaleItem
from app.models.user import User
from app.routers.auth import get_current_user, require_admin
from app.schemas.sale import SaleCreate, SaleResponse

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

    sale = Sale(
        client_uuid=data.client_uuid,
        total=data.total,
        payment_method=data.payment_method,
        created_at=data.created_at.replace(tzinfo=None),
        synced_at=datetime.utcnow(),
        user_id=current_user.id,
    )

    for item_data in data.items:
        sale.items.append(SaleItem(
            product_id=item_data.product_id,
            product_name=item_data.product_name,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            subtotal=item_data.subtotal,
        ))
        result = await db.execute(select(Product).where(Product.id == item_data.product_id))
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
    await db.refresh(sale, attribute_names=["items"])
    return sale


@router.get("", response_model=list[SaleResponse])
async def get_sales(
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Sale)
        .options(selectinload(Sale.items))
        .where(Sale.cancelled == False)  # noqa: E712
        .order_by(Sale.created_at.desc())
    )

    # Employees only see their own sales for today
    if current_user.role == "employee":
        tz = ZoneInfo(settings.timezone)
        today_str = datetime.now(tz).strftime("%Y-%m-%d")
        date_from = today_str
        date_to = today_str
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
    return result.scalars().unique().all()


@router.get("/count")
async def get_sales_count(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tz = ZoneInfo(settings.timezone)
    query = select(func.count(Sale.id))

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
    _: User = Depends(require_admin),
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
    for item in sale.items:
        prod = (
            await db.execute(select(Product).where(Product.id == item.product_id))
        ).scalars().first()
        if prod:
            prod.stock += item.quantity
    await db.commit()
