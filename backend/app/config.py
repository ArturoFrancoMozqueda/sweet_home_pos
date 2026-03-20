from pydantic_settings import BaseSettings


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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
