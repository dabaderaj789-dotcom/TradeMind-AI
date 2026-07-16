"""API tests for Liquidity Sweep endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_liquidity_sweep_service
from app.schemas.liquidity_sweep import (
    LiquiditySweepDetailResponse,
    LiquiditySweepExecuteResponse,
    LiquiditySweepListResponse,
    LiquiditySweepRecord,
)


@pytest.fixture
def mock_ls_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def ls_client(app, mock_ls_service: AsyncMock):
    app.dependency_overrides[get_liquidity_sweep_service] = lambda: mock_ls_service
    yield app
    app.dependency_overrides.pop(get_liquidity_sweep_service, None)


@pytest.fixture
async def client(ls_client) -> AsyncClient:
    transport = ASGITransport(app=ls_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_execute_endpoint(client: AsyncClient, mock_ls_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ls_service.execute = AsyncMock(
        return_value=LiquiditySweepExecuteResponse(
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
        "/api/v1/liquidity-sweeps/execute",
        json={"symbol_id": str(symbol_id), "timeframe": "1h"},
    )
    assert response.status_code == 200
    assert response.json()["bars_persisted"] == 500


@pytest.mark.asyncio
async def test_active_endpoint(client: AsyncClient, mock_ls_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ls_service.get_active = AsyncMock(
        return_value=LiquiditySweepListResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            as_of=datetime.now(UTC),
            items=[
                LiquiditySweepRecord(
                    sweep_id="sw1",
                    type="sell_side",
                    sweep_level=100.0,
                    level_type="swing_high",
                    penetration_depth=2.5,
                    status="confirmed",
                    strength_score=78.0,
                    strength_components={"penetration_depth": 80.0},
                    confirmation_components={"immediate_rejection": 75.0},
                    confidence=0.88,
                    explanation="Sell-side sweep",
                    created_at=datetime.now(UTC),
                    timeframe_code="1h",
                )
            ],
            total=1,
        )
    )
    response = await client.get(f"/api/v1/liquidity-sweeps/active/{symbol_id}?timeframe=1h")
    assert response.status_code == 200
    assert response.json()["total"] == 1


@pytest.mark.asyncio
async def test_failed_endpoint(client: AsyncClient, mock_ls_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ls_service.get_failed = AsyncMock(
        return_value=LiquiditySweepListResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            items=[],
            total=0,
        )
    )
    response = await client.get(f"/api/v1/liquidity-sweeps/failed/{symbol_id}?timeframe=1h")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_details_endpoint(client: AsyncClient, mock_ls_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    record = LiquiditySweepRecord(
        sweep_id="sw1",
        type="sell_side",
        sweep_level=100.0,
        level_type="swing_high",
        penetration_depth=2.5,
        status="confirmed",
        strength_score=78.0,
        strength_components={},
        confirmation_components={},
        confidence=0.88,
        explanation="Sell-side sweep",
        created_at=datetime.now(UTC),
        timeframe_code="1h",
    )
    mock_ls_service.get_details = AsyncMock(
        return_value=LiquiditySweepDetailResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            item=record,
        )
    )
    response = await client.get(
        f"/api/v1/liquidity-sweeps/details/{symbol_id}?timeframe=1h&sweep_id=sw1"
    )
    assert response.status_code == 200
    assert response.json()["item"]["sweep_id"] == "sw1"
