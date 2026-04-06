from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SaleItemCreate(BaseModel):
    product_id: int
    product_name: str = Field(..., min_length=1)
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    subtotal: float = Field(..., ge=0)


class SaleCreate(BaseModel):
    client_uuid: str = Field(..., min_length=1)
    total: float = Field(..., gt=0)
    payment_method: Literal["efectivo", "transferencia"]
    created_at: datetime
    items: list[SaleItemCreate] = Field(..., min_length=1)


class SaleItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float

    model_config = {"from_attributes": True}


class SaleResponse(BaseModel):
    id: int
    client_uuid: str
    total: float
    payment_method: str
    created_at: datetime
    synced_at: datetime
    cancelled: bool
    items: list[SaleItemResponse]

    model_config = {"from_attributes": True}
