from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ShiftOpen(BaseModel):
    opening_cash: float = Field(..., ge=0)


class ShiftClose(BaseModel):
    closing_cash: float = Field(..., ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class ShiftResponse(BaseModel):
    id: int
    user_id: int
    username: str
    opened_at: datetime
    closed_at: Optional[datetime] = None
    opening_cash: float
    closing_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    cash_sales: Optional[float] = None
    transfer_sales: Optional[float] = None
    cash_in: Optional[float] = None
    cash_out: Optional[float] = None
    variance: Optional[float] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}
