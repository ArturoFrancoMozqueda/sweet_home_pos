from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0)
    stock: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=5, ge=0)
    active: bool = True
    cost_price: Optional[float] = Field(default=None, ge=0)
    image_url: Optional[str] = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    price: Optional[float] = Field(default=None, gt=0)
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)
    active: Optional[bool] = None
    cost_price: Optional[float] = Field(default=None, ge=0)
    image_url: Optional[str] = None


class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductStockUpdate(BaseModel):
    stock: int = Field(..., ge=0)
