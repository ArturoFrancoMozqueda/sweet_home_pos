import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import UPLOADS_DIR, settings
from app.database import async_session, engine, init_db
from app.routers import products, reports, sales, shifts, sync
from app.routers import auth as auth_router
from app.seed import seed_products
from app.services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _seed_admin():
    """Create default admin user if none exists."""
    if not settings.admin_password:
        logger.warning("ADMIN_PASSWORD not set — skipping admin seed")
        return

    from sqlalchemy import select
    from app.models.user import User
    from app.services.auth_service import hash_password

    async with async_session() as db:
        result = await db.execute(select(User).where(User.role == "admin"))
        if result.scalars().first():
            return  # Admin already exists

        admin = User(
            username=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
            role="admin",
        )
        db.add(admin)
        await db.commit()
        logger.info(f"Admin user '{settings.admin_username}' created")


async def _migrate_user_id():
    """Idempotent migration: add user_id column to sales if missing."""
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)"
        ))


async def _migrate_cancelled():
    """Idempotent migration: add cancelled column to sales if missing."""
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE"
        ))


async def _migrate_image_url():
    """Idempotent migration: add image_url column to products if missing."""
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)"
        ))


async def _migrate_numeric_columns():
    """Idempotent migration: convert Float columns to NUMERIC(10,2) for precision."""
    async with engine.begin() as conn:
        for stmt in [
            "ALTER TABLE products ALTER COLUMN price TYPE NUMERIC(10,2)",
            "ALTER TABLE sales ALTER COLUMN total TYPE NUMERIC(10,2)",
            "ALTER TABLE sale_items ALTER COLUMN unit_price TYPE NUMERIC(10,2)",
            "ALTER TABLE sale_items ALTER COLUMN subtotal TYPE NUMERIC(10,2)",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass  # Column already NUMERIC or SQLite (no ALTER TYPE)


async def _migrate_shifts():
    """Idempotent migration: create shifts table and add shift_id to sales."""
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shifts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                opened_at TIMESTAMP NOT NULL,
                closed_at TIMESTAMP,
                opening_cash NUMERIC(10,2) NOT NULL,
                closing_cash NUMERIC(10,2),
                expected_cash NUMERIC(10,2),
                cash_sales NUMERIC(10,2),
                transfer_sales NUMERIC(10,2),
                variance NUMERIC(10,2),
                notes VARCHAR(500)
            )
        """))
        await conn.execute(text(
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id)"
        ))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Sweet Home POS...")
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    await init_db()
    await _migrate_user_id()
    await _migrate_cancelled()
    await _migrate_image_url()
    await _migrate_numeric_columns()
    await _migrate_shifts()
    # Add cost_price column to products
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)"
        ))
    async with async_session() as db:
        await seed_products(db)
    await _seed_admin()
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

app.include_router(auth_router.router)
app.include_router(products.router)
app.include_router(sales.router)
app.include_router(reports.router)
app.include_router(sync.router)
app.include_router(shifts.router)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR.parent), name="uploads")


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
