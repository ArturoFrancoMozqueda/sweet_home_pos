from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.routers.auth import require_admin
from app.services.report_service import generate_daily_report

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/daily")
async def get_daily_report(
    date: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get daily report. If no date provided, returns today's report (Mexico City time)."""
    return await generate_daily_report(db, date)


@router.post("/send-test")
async def send_test_email(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Send a test daily report email for today."""
    from app.services.email_service import send_daily_report_email

    report = await generate_daily_report(db)
    success = await send_daily_report_email(report)
    return {"sent": success, "report": report}
