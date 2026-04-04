from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.routers.auth import get_current_user, require_admin
from app.schemas.product import ProductCreate, ProductResponse, ProductStockUpdate

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=list[ProductResponse])
async def get_products(
    active_only: bool = True,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Product).order_by(Product.name)
    if active_only:
        query = query.where(Product.active == True)  # noqa: E712
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    data: ProductCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    product = Product(**data.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@router.put("/{product_id}/stock", response_model=ProductResponse)
async def update_stock(
    product_id: int,
    data: ProductStockUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalars().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.stock = data.stock
    await db.commit()
    await db.refresh(product)
    return product


@router.get("/low-stock", response_model=list[ProductResponse])
async def get_low_stock(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product)
        .where(Product.active == True, Product.stock <= Product.low_stock_threshold)  # noqa: E712
        .order_by(Product.stock)
    )
    return result.scalars().all()
