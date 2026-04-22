from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    opening_cash: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    closing_cash: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    expected_cash: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    cash_sales: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    transfer_sales: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    cash_in: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    cash_out: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    variance: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    user: Mapped["User"] = relationship()  # noqa: F821
