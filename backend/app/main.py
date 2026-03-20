import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import async_session, init_db
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
