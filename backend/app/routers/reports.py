from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user, require_admin
from app.services.report_service import generate_daily_report, generate_range_report

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/daily")
async def get_daily_report(
    date: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily report. Employees see only their own sales; admins see the
    full aggregate plus a per-vendor breakdown."""
    return await generate_daily_report(db, date, user=user)


@router.get("/range")
async def get_range_report(
    date_from: str,
    date_to: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only range analytics: totals, per-day series, top products,
    and payment breakdown for the inclusive [date_from, date_to] window."""
    try:
        start = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Formato de fecha inválido (YYYY-MM-DD)")
    if start > end:
        raise HTTPException(status_code=422, detail="date_from debe ser anterior o igual a date_to")
    return await generate_range_report(db, date_from, date_to)


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
