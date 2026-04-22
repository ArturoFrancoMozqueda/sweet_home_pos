import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product
from app.models.sale import Sale, SaleItem, SalePayment
from app.models.shift import Shift
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.sales import derive_payment_method, resolve_payments
from app.schemas.sync import SyncFailure, SyncRequest, SyncResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
async def sync_sales(
    data: SyncRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    synced_uuids: list[str] = []
    failed: list[SyncFailure] = []

    # Find user's current open shift
    shift_result = await db.execute(
        select(Shift).where(Shift.user_id == current_user.id, Shift.closed_at.is_(None))
    )
    current_shift = shift_result.scalars().first()
    if not current_shift:
        product_query = select(Product).order_by(Product.name)
        if current_user.role != "admin":
            product_query = product_query.where(Product.active == True)  # noqa: E712
        result = await db.execute(product_query)
        return SyncResponse(
            synced_uuids=[],
            failed=[
                SyncFailure(
                    uuid=sale_data.client_uuid,
                    reason="Necesitas un turno abierto antes de sincronizar ventas",
                )
                for sale_data in data.sales
            ],
            products=result.scalars().all(),
        )

    for sale_data in data.sales:
        # Skip if already synced (deduplication by UUID)
        existing = await db.execute(
            select(Sale).where(Sale.client_uuid == sale_data.client_uuid)
        )
        if existing.scalars().first():
            synced_uuids.append(sale_data.client_uuid)
            continue

        # Validate totals, payments, and discount in one pass via the shared helper.
        try:
            payments = resolve_payments(sale_data)
        except ValueError as e:
            failed.append(SyncFailure(
                uuid=sale_data.client_uuid,
                reason=str(e),
            ))
            continue

        # Per-sale savepoint: a DB failure on one sale rolls back only that sale,
        # not the whole batch. The client only sees a UUID in synced_uuids when
        # the row actually persisted (or pre-existed).
        try:
            async with db.begin_nested():
                sale = Sale(
                    client_uuid=sale_data.client_uuid,
                    total=sale_data.total,
                    discount_amount=sale_data.discount_amount,
                    payment_method=derive_payment_method(payments),
                    created_at=sale_data.created_at.replace(tzinfo=None),
                    synced_at=datetime.utcnow(),
                    user_id=current_user.id,
                    shift_id=current_shift.id if current_shift else None,
                )

                for p in payments:
                    sale.payments.append(SalePayment(method=p.method, amount=p.amount))

                for item_data in sale_data.items:
                    sale_item = SaleItem(
                        product_id=item_data.product_id,
                        product_name=item_data.product_name,
                        quantity=item_data.quantity,
                        unit_price=item_data.unit_price,
                        subtotal=item_data.subtotal,
                    )
                    sale.items.append(sale_item)

                    # Discount inventory with row lock
                    result = await db.execute(
                        select(Product).where(Product.id == item_data.product_id).with_for_update()
                    )
                    product = result.scalars().first()
                    if product:
                        product.stock = max(0, product.stock - item_data.quantity)

                db.add(sale)
                await db.flush()
            synced_uuids.append(sale_data.client_uuid)
        except IntegrityError:
            # Concurrent request persisted the same client_uuid first — treat as synced.
            logger.warning("Duplicate UUID race on sync: %s", sale_data.client_uuid)
            synced_uuids.append(sale_data.client_uuid)
        except SQLAlchemyError:
            logger.exception("DB error syncing sale %s", sale_data.client_uuid)
            failed.append(SyncFailure(
                uuid=sale_data.client_uuid,
                reason="Error de base de datos al guardar la venta",
            ))
        except Exception as exc:
            logger.exception("Unexpected error syncing sale %s", sale_data.client_uuid)
            failed.append(SyncFailure(
                uuid=sale_data.client_uuid,
                reason=f"Error inesperado ({type(exc).__name__})",
            ))

    await db.commit()

    # Return updated product list. Admin inventory needs inactive products too.
    product_query = select(Product).order_by(Product.name)
    if current_user.role != "admin":
        product_query = product_query.where(Product.active == True)  # noqa: E712
    result = await db.execute(product_query)
    products = result.scalars().all()

    return SyncResponse(synced_uuids=synced_uuids, failed=failed, products=products)
