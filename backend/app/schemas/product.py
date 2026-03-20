from datetime import datetime

from pydantic import BaseModel


class ProductBase(BaseModel):
    name: str
    price: float
    stock: int = 0
    low_stock_threshold: int = 5
    active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductStockUpdate(BaseModel):
    stock: int
