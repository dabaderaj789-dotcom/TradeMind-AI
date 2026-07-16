"""Health check service with dependency probing."""

import time
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import Settings
from app.schemas.common import HealthResponse, ServiceStatus


class HealthService:
    """Aggregates health status from application system dependencies."""

    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self._session = session
        self._settings = settings

    async def check_database(self) -> ServiceStatus:
        """Probe PostgreSQL connectivity and measure latency."""
        start = time.perf_counter()
        try:
            await self._session.execute(text("SELECT 1"))
            latency_ms = (time.perf_counter() - start) * 1000
            return ServiceStatus(
                name="postgresql",
                status="healthy",
                latency_ms=round(latency_ms, 2),
            )
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            return ServiceStatus(
                name="postgresql",
                status="unhealthy",
                latency_ms=round(latency_ms, 2),
                detail=str(exc),
            )

    async def get_health(self) -> HealthResponse:
        """Build the full health check response."""
        db_status = await self.check_database()

        services = [db_status]
        overall = "healthy"
        if any(s.status == "unhealthy" for s in services):
            overall = "unhealthy"
        elif any(s.status == "degraded" for s in services):
            overall = "degraded"

        return HealthResponse(
            status=overall,
            version=self._settings.app_version,
            environment=self._settings.app_env,
            timestamp=datetime.now(UTC),
            services=services,
        )
