"""API tests for Fair Value Gap endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_fair_value_gap_service
from app.schemas.fvg import FvgExecuteResponse, FvgListResponse, FvgRecord


@pytest.fixture
def mock_fvg_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def fvg_client(app, mock_fvg_service: AsyncMock):
    app.dependency_overrides[get_fair_value_gap_service] = lambda: mock_fvg_service
    yield app
    app.dependency_overrides.pop(get_fair_value_gap_service, None)


@pytest.fixture
async def client(fvg_client) -> AsyncClient:
    transport = ASGITransport(app=fvg_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_execute_endpoint(client: AsyncClient, mock_fvg_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_fvg_service.execute = AsyncMock(
        return_value=FvgExecuteResponse(
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
        "/api/v1/fair-value-gaps/execute",
        json={"symbol_id": str(symbol_id), "timeframe": "1h"},
    )
    assert response.status_code == 200
    assert response.json()["bars_persisted"] == 500


@pytest.mark.asyncio
async def test_active_endpoint(client: AsyncClient, mock_fvg_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_fvg_service.get_active = AsyncMock(
        return_value=FvgListResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            as_of=datetime.now(UTC),
            items=[
                FvgRecord(
                    fvg_id="fvg1",
                    type="bullish",
                    gap_high=102.0,
                    gap_low=100.0,
                    gap_size=2.0,
                    gap_percent=1.98,
                    status="open",
                    fill_state="open",
                    fill_percentage=0.0,
                    quality_score=75.0,
                    quality_components={"gap_size_atr": 80.0},
                    confidence=0.85,
                    explanation="Bullish FVG detected",
                    created_at=datetime.now(UTC),
                    timeframe_code="1h",
                )
            ],
            total=1,
        )
    )
    response = await client.get(f"/api/v1/fair-value-gaps/active/{symbol_id}?timeframe=1h")
    assert response.status_code == 200
    assert response.json()["total"] == 1


@pytest.mark.asyncio
async def test_filled_endpoint(client: AsyncClient, mock_fvg_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_fvg_service.get_filled = AsyncMock(
        return_value=FvgListResponse(symbol_id=symbol_id, timeframe="1h", items=[], total=0)
    )
    response = await client.get(f"/api/v1/fair-value-gaps/filled/{symbol_id}?timeframe=1h")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_invalidated_endpoint(client: AsyncClient, mock_fvg_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_fvg_service.get_invalidated = AsyncMock(
        return_value=FvgListResponse(symbol_id=symbol_id, timeframe="1h", items=[], total=0)
    )
    response = await client.get(f"/api/v1/fair-value-gaps/invalidated/{symbol_id}?timeframe=1h")
    assert response.status_code == 200
