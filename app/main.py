"""TradeMind AI FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from os import environ
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from app.adapters.registry import init_adapters
from app.engines.analysis.registry import init_analysis_plugins
from app.engines.strategy.registry import init_strategies
from app.api.v1.router import api_v1_router
from app.config.settings import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.database.session import close_db, init_db


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown lifecycle."""
    settings = get_settings()
    setup_logging(settings)
    init_db(settings)
    init_adapters()
    init_analysis_plugins()
    init_strategies()
    logger.info(
        "Starting {} v{} in {} mode",
        settings.app_name,
        settings.app_version,
        settings.app_env,
    )
    yield
    await close_db()
    logger.info("Application shutdown complete")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory for FastAPI with all middleware and routes configured."""
    resolved_settings = settings or get_settings()

    app = FastAPI(
        title=resolved_settings.app_name,
        version=resolved_settings.app_version,
        description="Production-grade AI trading platform backend",
        docs_url="/docs" if not resolved_settings.is_production else None,
        redoc_url="/redoc" if not resolved_settings.is_production else None,
        openapi_url="/openapi.json" if not resolved_settings.is_production else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origin_list,
        # Opt-in via CORS_ALLOW_VERCEL_PREVIEWS=1 — avoid open *.vercel.app in production by default
        allow_origin_regex=(
            r"https://.*\.vercel\.app"
            if environ.get("CORS_ALLOW_VERCEL_PREVIEWS", "").lower() in {"1", "true", "yes"}
            else None
        ),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(
        api_v1_router,
        prefix=resolved_settings.api_v1_prefix,
    )

    _mount_replay_studio(app)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "name": resolved_settings.app_name,
            "version": resolved_settings.app_version,
            "docs": "/docs",
            "health": f"{resolved_settings.api_v1_prefix}/health",
        }

    return app


def _mount_replay_studio(app: FastAPI) -> None:
    """Serve built Replay Studio static assets when available."""
    studio_dist = Path(__file__).resolve().parent.parent / "studio" / "dist"
    if not studio_dist.is_dir():
        return

    assets_dir = studio_dist / "assets"
    if assets_dir.is_dir():
        app.mount("/studio/assets", StaticFiles(directory=assets_dir), name="studio-assets")

    index_file = studio_dist / "index.html"

    @app.get("/studio", include_in_schema=False)
    async def studio_root() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/studio/{path:path}", include_in_schema=False)
    async def studio_spa(path: str) -> FileResponse:
        return FileResponse(index_file)


app = create_app()
