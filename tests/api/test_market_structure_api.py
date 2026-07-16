"""API tests for Market Structure endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_market_structure_service
from app.schemas.market_structure import (
    LevelsResponse,
    MarketStructureExecuteResponse,
    StructureEventsResponse,
    TrendResponse,
)


@pytest.fixture
def mock_ms_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def ms_client(app, mock_ms_service: AsyncMock):
    app.dependency_overrides[get_market_structure_service] = lambda: mock_ms_service
    yield app
    app.dependency_overrides.pop(get_market_structure_service, None)


@pytest.fixture
async def client(ms_client) -> AsyncClient:
    transport = ASGITransport(app=ms_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_execute_endpoint(client: AsyncClient, mock_ms_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ms_service.execute = AsyncMock(
        return_value=MarketStructureExecuteResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            computed_at=datetime.now(UTC),
            bars_computed=500,
            bars_persisted=500,
            plugin_version="1.0.0",
            params_hash="abc",
        )
    )
    response = await client.post(
        "/api/v1/market-structure/execute",
        json={"symbol_id": str(symbol_id), "timeframe": "1h"},
    )
    assert response.status_code == 200
    assert response.json()["bars_persisted"] == 500


@pytest.mark.asyncio
async def test_trend_endpoint(client: AsyncClient, mock_ms_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ms_service.get_current_trend = AsyncMock(
        return_value=TrendResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            as_of=datetime.now(UTC),
            trend="bullish",
            market_phase="trending",
            phase_confidence=0.8,
            confidence=0.75,
        )
    )
    response = await client.get(f"/api/v1/market-structure/trend/{symbol_id}?timeframe=1h")
    assert response.status_code == 200
    assert response.json()["trend"] == "bullish"
