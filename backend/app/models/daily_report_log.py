from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DailyReportLog(Base):
    __tablename__ = "daily_report_log"

    # Mexico-TZ calendar date in YYYY-MM-DD form; one row per day the report was sent.
    report_date: Mapped[str] = mapped_column(String(10), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
