import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.user import User
from app.routers.auth import get_current_user, require_admin
from app.schemas.product import ProductCreate, ProductResponse, ProductStockUpdate, ProductUpdate

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


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalars().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
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


# ── Image upload & serving (stored in PostgreSQL) ──

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/upload-image")
async def upload_image(
    file: UploadFile,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Solo imágenes JPG, PNG, WebP o GIF")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx 5 MB)")

    image_uuid = uuid.uuid4().hex
    image = ProductImage(
        uuid=image_uuid,
        content_type=file.content_type or "image/jpeg",
        data=contents,
    )
    db.add(image)
    await db.commit()

    return {"url": f"/api/products/images/{image_uuid}"}


@router.get("/images/{image_uuid}")
async def get_image(
    image_uuid: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductImage).where(ProductImage.uuid == image_uuid)
    )
    image = result.scalars().first()
    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
        },
    )
