from datetime import datetime

from pydantic import BaseModel


class SaleItemCreate(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float


class SaleCreate(BaseModel):
    client_uuid: str
    total: float
    payment_method: str
    created_at: datetime
    items: list[SaleItemCreate]


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
