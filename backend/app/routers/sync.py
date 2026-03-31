from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.schemas.sync import SyncRequest, SyncResponse

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
async def sync_sales(data: SyncRequest, db: AsyncSession = Depends(get_db)):
    synced_uuids: list[str] = []

    for sale_data in data.sales:
        # Skip if already synced (deduplication by UUID)
        existing = await db.execute(
            select(Sale).where(Sale.client_uuid == sale_data.client_uuid)
        )
        if existing.scalars().first():
            synced_uuids.append(sale_data.client_uuid)
            continue

        sale = Sale(
            client_uuid=sale_data.client_uuid,
            total=sale_data.total,
            payment_method=sale_data.payment_method,
            created_at=sale_data.created_at.replace(tzinfo=None),
            synced_at=datetime.utcnow(),
        )

        for item_data in sale_data.items:
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
        synced_uuids.append(sale_data.client_uuid)

    await db.commit()

    # Return updated product list
    result = await db.execute(
        select(Product).where(Product.active == True).order_by(Product.name)  # noqa: E712
    )
    products = result.scalars().all()

    return SyncResponse(synced_uuids=synced_uuids, products=products)
