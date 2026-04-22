from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

OrderStatus = Literal["new", "in_production", "ready", "delivered", "cancelled"]


class OrderBase(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=120)
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    pickup_at: datetime
    total_amount: float = Field(..., gt=0)
    deposit_amount: float = Field(default=0, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class OrderCreate(OrderBase):
    status: OrderStatus = "new"


class OrderUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    pickup_at: Optional[datetime] = None
    total_amount: Optional[float] = Field(default=None, gt=0)
    deposit_amount: Optional[float] = Field(default=None, ge=0)
    status: Optional[OrderStatus] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class OrderResponse(OrderBase):
    id: int
    user_id: int
    username: str
    status: OrderStatus
    created_at: datetime
    updated_at: datetime
    balance_due: float

    model_config = {"from_attributes": True}
