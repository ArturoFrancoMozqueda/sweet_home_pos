import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import async_session, engine, init_db
from app.routers import products, reports, sales, sync
from app.seed import seed_products
from app.services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Sweet Home POS...")
    await init_db()
    async with async_session() as db:
        await seed_products(db)
    start_scheduler()
    logger.info("Sweet Home POS ready")
    yield
    # Shutdown
    stop_scheduler()
    await engine.dispose()
    logger.info("Sweet Home POS stopped")


app = FastAPI(
    title="Sweet Home POS",
    description="Sistema de punto de venta para Sweet Home",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router)
app.include_router(sales.router)
app.include_router(reports.router)
app.include_router(sync.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "Sweet Home POS"}


@app.post("/api/cron/daily-report")
async def trigger_daily_report(authorization: str = Header(None)):
    """Endpoint for external cron services to trigger the daily report email."""
    expected_token = settings.cron_secret
    if not expected_token:
        raise HTTPException(status_code=503, detail="Cron not configured")
    if authorization != f"Bearer {expected_token}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    from app.services.email_service import send_daily_report_email
    from app.services.report_service import generate_daily_report

    async with async_session() as db:
        report = await generate_daily_report(db)
        success = await send_daily_report_email(report)

    return {"sent": success, "date": report["date"]}
