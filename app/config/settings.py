"""Pydantic settings loaded from environment and .env file."""

from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from pydantic import Field, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _rewrite_pg_scheme(url: str, scheme: str) -> str:
    """Swap postgres scheme (e.g. Neon DATABASE_URL → asyncpg / sync)."""
    raw = url.strip()
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    parsed = urlparse(raw)
    # Drop sqlAlchemy-incompatible query keys; keep sslmode for libpq / translate for asyncpg.
    q = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if scheme.startswith("postgresql+asyncpg"):
        # asyncpg uses `ssl=require` rather than `sslmode=require`
        if q.pop("sslmode", None) in {"require", "verify-full", "verify-ca"}:
            q["ssl"] = "require"
        q.pop("channel_binding", None)
    new = parsed._replace(scheme=scheme, query=urlencode(q))
    return urlunparse(new)


class Settings(BaseSettings):
    """Central application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    # Application
    app_name: str = Field(default="TradeMind AI", alias="APP_NAME")
    app_version: str = Field(default="0.1.0", alias="APP_VERSION")
    app_env: Literal["development", "staging", "production"] = Field(
        default="development",
        alias="APP_ENV",
    )
    debug: bool = Field(default=False, alias="DEBUG")
    api_v1_prefix: str = Field(default="/api/v1", alias="API_V1_PREFIX")

    # Server
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8000, alias="PORT")

    # Database — prefer Neon/Railway DATABASE_URL when set; else discrete POSTGRES_* parts
    database_url_env: str | None = Field(default=None, alias="DATABASE_URL")
    postgres_host: str = Field(default="localhost", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_user: str = Field(default="trademind", alias="POSTGRES_USER")
    postgres_password: str = Field(default="trademind_secret", alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(default="trademind_db", alias="POSTGRES_DB")
    database_echo: bool = Field(default=False, alias="DATABASE_ECHO")

    # CORS — include LAN origins for phone / Wi-Fi access; cloud: add Vercel URLs
    cors_origins: str = Field(
        default=(
            "http://localhost:3000,http://localhost:5173,http://localhost:5175,"
            "http://127.0.0.1:5173,http://127.0.0.1:5175,"
            "http://192.168.0.133:5173,http://192.168.0.133:5175"
        ),
        alias="CORS_ORIGINS",
    )

    # Logging
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: Literal["json", "text"] = Field(default="json", alias="LOG_FORMAT")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        """Async PostgreSQL connection URL for SQLAlchemy."""
        if self.database_url_env:
            return _rewrite_pg_scheme(self.database_url_env, "postgresql+asyncpg")
        return str(
            PostgresDsn.build(
                scheme="postgresql+asyncpg",
                username=self.postgres_user,
                password=self.postgres_password,
                host=self.postgres_host,
                port=self.postgres_port,
                path=self.postgres_db,
            )
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url_sync(self) -> str:
        """Sync PostgreSQL connection URL for Alembic migrations."""
        if self.database_url_env:
            return _rewrite_pg_scheme(self.database_url_env, "postgresql")
        return str(
            PostgresDsn.build(
                scheme="postgresql",
                username=self.postgres_user,
                password=self.postgres_password,
                host=self.postgres_host,
                port=self.postgres_port,
                path=self.postgres_db,
            )
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton for dependency injection."""
    return Settings()
