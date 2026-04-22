from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

InventoryMovementType = Literal[
    "purchase",
    "production",
    "waste",
    "breakage",
    "adjustment_in",
    "adjustment_out",
]


class InventoryMovementCreate(BaseModel):
    product_id: int
    movement_type: InventoryMovementType
    quantity: int = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=300)


class InventoryMovementResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    user_id: int
    username: str
    movement_type: InventoryMovementType
    quantity_delta: int
    resulting_stock: int
    reason: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
