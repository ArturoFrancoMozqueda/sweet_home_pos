from datetime import datetime, timezone

from pydantic import BaseModel, field_validator


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

    @field_validator("created_at", mode="before")
    @classmethod
    def strip_timezone(cls, v: datetime) -> datetime:
        if isinstance(v, datetime) and v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


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
    items: list[SaleItemResponse]

    model_config = {"from_attributes": True}
