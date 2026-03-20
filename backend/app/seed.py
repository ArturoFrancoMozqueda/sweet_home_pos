from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product

INITIAL_PRODUCTS = [
    {"name": "Galletas tipo New York", "price": 45},
    {"name": "Galletas de canela", "price": 3},
    {"name": "Galletas nuez", "price": 3},
    {"name": "Galletas de chispas de chocolate", "price": 20},
    {"name": "Galletas de arándano con avena", "price": 20},
    {"name": "Alfajores", "price": 15},
    {"name": "Empanadas de mermelada", "price": 15},
    {"name": "Empanadas de hojaldre", "price": 25},
    {"name": "Pan de elote", "price": 25},
    {"name": "Pastel de zanahoria (rebanada)", "price": 45},
    {"name": "Pastel de chocolate (rebanada)", "price": 45},
    {"name": "Pay de limón (rebanada)", "price": 25},
    {"name": "Pay de queso (rebanada)", "price": 25},
    {"name": "Flan (rebanada)", "price": 25},
    {"name": "Galletas decoradas (grandes)", "price": 45},
    {"name": "Galletas decoradas (chicas)", "price": 30},
    {"name": "Paquetes chicos de galletas (nuez o canela)", "price": 50},
    {"name": "Paquete grande de galletas (nuez o canela)", "price": 75},
]


async def seed_products(db: AsyncSession):
    result = await db.execute(select(Product).limit(1))
    if result.scalars().first() is not None:
        return

    for product_data in INITIAL_PRODUCTS:
        product = Product(
            name=product_data["name"],
            price=product_data["price"],
            stock=0,
            low_stock_threshold=5,
        )
        db.add(product)

    await db.commit()
