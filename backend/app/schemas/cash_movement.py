from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

CashMovementType = Literal["in", "out"]


class CashMovementCreate(BaseModel):
    movement_type: CashMovementType
    amount: float = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=300)


class CashMovementResponse(BaseModel):
    id: int
    user_id: int
    username: str
    shift_id: int
    movement_type: CashMovementType
    amount: float
    reason: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
