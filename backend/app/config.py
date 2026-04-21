from pathlib import Path

from pydantic_settings import BaseSettings

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "products"

_DEFAULT_JWT_SECRET = "changeme-use-a-real-secret-in-production"


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./sweet_home.db"
    gmail_user: str = ""
    gmail_app_password: str = ""
    email_recipient: str = ""
    timezone: str = "America/Mexico_City"
    daily_report_hour: int = 21
    daily_report_minute: int = 0
    cors_origins: str = "http://localhost:5173"
    cron_secret: str = ""
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_expire_hours: int = 8
    admin_username: str = "admin"
    admin_password: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

if settings.jwt_secret == _DEFAULT_JWT_SECRET:
    import logging as _log

    # Hard fail against Postgres — that's the production deployment target.
    # SQLite is only used for local development, so a warning is enough there.
    if settings.database_url.startswith("postgresql"):
        raise RuntimeError(
            "JWT_SECRET is set to the default value. Refusing to boot against PostgreSQL. "
            "Generate a secret with: python -c \"import secrets; print(secrets.token_urlsafe(64))\" "
            "and set it in the JWT_SECRET env var."
        )
    _log.getLogger(__name__).warning(
        "⚠️  JWT_SECRET is using the default value. Set a secure secret in .env for production!"
    )
