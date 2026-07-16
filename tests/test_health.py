"""Tests for health check endpoint and service."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient

from app.services.health import HealthService


@pytest.mark.asyncio
async def test_health_endpoint_returns_200(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "degraded", "unhealthy")
    assert data["version"] == "0.1.0-test"
    assert data["environment"] == "development"
    assert "services" in data
    assert len(data["services"]) >= 1


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient) -> None:
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TradeMind AI Test"
    assert "health" in data


@pytest.mark.asyncio
async def test_health_service_database_healthy(health_service: HealthService) -> None:
    health_service._session.execute = AsyncMock(return_value=MagicMock())
    status = await health_service.check_database()
    assert status.name == "postgresql"
    assert status.status == "healthy"
    assert status.latency_ms is not None
    assert status.latency_ms >= 0


@pytest.mark.asyncio
async def test_health_service_database_unhealthy(health_service: HealthService) -> None:
    health_service._session.execute = AsyncMock(side_effect=ConnectionError("DB down"))
    status = await health_service.check_database()
    assert status.status == "unhealthy"
    assert status.detail is not None


@pytest.mark.asyncio
async def test_health_service_overall_status(health_service: HealthService) -> None:
    health_service._session.execute = AsyncMock(return_value=MagicMock())
    health = await health_service.get_health()
    assert health.status == "healthy"
    assert health.version == "0.1.0-test"
