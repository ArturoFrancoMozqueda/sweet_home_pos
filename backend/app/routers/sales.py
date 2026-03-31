from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.schemas.sale import SaleCreate, SaleResponse

router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.post("", response_model=SaleResponse, status_code=201)
async def create_sale(data: SaleCreate, db: AsyncSession = Depends(get_db)):
    # Check for duplicate
    existing = await db.execute(
        select(Sale).where(Sale.client_uuid == data.client_uuid)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Venta ya registrada")

    sale = Sale(
        client_uuid=data.client_uuid,
        total=data.total,
        payment_method=data.payment_method,
        created_at=data.created_at.replace(tzinfo=None),
        synced_at=datetime.utcnow(),
    )

    for item_data in data.items:
        sale_item = SaleItem(
            product_id=item_data.product_id,
            product_name=item_data.product_name,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            subtotal=item_data.subtotal,
        )
        sale.items.append(sale_item)

        # Discount inventory
        result = await db.execute(
            select(Product).where(Product.id == item_data.product_id)
        )
        product = result.scalars().first()
        if product:
            product.stock = max(0, product.stock - item_data.quantity)

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
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Sale)
        .options(selectinload(Sale.items))
        .order_by(Sale.created_at.desc())
    )

    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d")
        query = query.where(Sale.created_at >= start)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        query = query.where(Sale.created_at <= end)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().unique().all()


@router.get("/count")
async def get_sales_count(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(func.count(Sale.id))
    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d")
        query = query.where(Sale.created_at >= start)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        query = query.where(Sale.created_at <= end)
    result = await db.execute(query)
    return {"count": result.scalar()}
