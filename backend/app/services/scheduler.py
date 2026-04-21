import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.database import async_session
from app.services.email_service import send_daily_report_once

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def daily_report_job():
    logger.info("Running daily report job...")
    try:
        async with async_session() as db:
            await send_daily_report_once(db)
    except Exception as e:
        logger.error(f"Daily report job failed: {e}")


def start_scheduler():
    scheduler.add_job(
        daily_report_job,
        CronTrigger(
            hour=settings.daily_report_hour,
            minute=settings.daily_report_minute,
            timezone=settings.timezone,
        ),
        id="daily_report",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        f"Scheduler started: daily report at {settings.daily_report_hour}:{settings.daily_report_minute:02d} {settings.timezone}"
    )


def stop_scheduler():
    scheduler.shutdown()
