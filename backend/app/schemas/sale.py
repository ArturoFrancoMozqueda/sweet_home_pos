from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SaleItemCreate(BaseModel):
    product_id: int
    product_name: str = Field(..., min_length=1)
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    subtotal: float = Field(..., ge=0)


class SalePaymentCreate(BaseModel):
    method: Literal["efectivo", "transferencia"]
    amount: float = Field(..., gt=0)


class SaleCreate(BaseModel):
    client_uuid: str = Field(..., min_length=1)
    total: float = Field(..., gt=0)
    # Back-compat: old clients send a single payment_method. New clients send
    # `payments` with one or more entries. If `payments` is absent, it's
    # constructed from payment_method + total server-side.
    payment_method: Literal["efectivo", "transferencia", "mixto"] | None = None
    payments: list[SalePaymentCreate] | None = None
    discount_amount: float = Field(default=0, ge=0)
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


class SalePaymentResponse(BaseModel):
    method: str
    amount: float

    model_config = {"from_attributes": True}


class SaleResponse(BaseModel):
    id: int
    client_uuid: str
    total: float
    payment_method: str
    payments: list[SalePaymentResponse] = []
    discount_amount: float = 0
    created_at: datetime
    synced_at: datetime
    cancelled: bool
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None
    cancelled_by_username: str | None = None
    items: list[SaleItemResponse]

    model_config = {"from_attributes": True}
