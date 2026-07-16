"""API tests for Trade Setup endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_trade_setup_service
from app.schemas.trade_setup import (
    TradeSetupDetailResponse,
    TradeSetupExecuteResponse,
    TradeSetupListResponse,
    TradeSetupRecord,
    TradeSetupZone,
)


@pytest.fixture
def mock_ts_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def ts_client(app, mock_ts_service: AsyncMock):
    app.dependency_overrides[get_trade_setup_service] = lambda: mock_ts_service
    yield app
    app.dependency_overrides.pop(get_trade_setup_service, None)


@pytest.fixture
async def client(ts_client) -> AsyncClient:
    transport = ASGITransport(app=ts_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_execute_endpoint(client: AsyncClient, mock_ts_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    run_id = uuid.uuid4()
    mock_ts_service.execute = AsyncMock(
        return_value=TradeSetupExecuteResponse(
            run_id=run_id,
            symbol_id=symbol_id,
            timeframe="1h",
            engine_version="1.0.0",
            params_hash="abc123",
            setups_detected=3,
            bars_scanned=500,
            computed_at=datetime.now(UTC),
        )
    )
    response = await client.post(
        "/api/v1/trade-setups/execute",
        json={"symbol_id": str(symbol_id), "timeframe": "1h"},
    )
    assert response.status_code == 200
    assert response.json()["setups_detected"] == 3


@pytest.mark.asyncio
async def test_active_endpoint(client: AsyncClient, mock_ts_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    record = TradeSetupRecord(
        setup_id="ts1",
        setup_type="trend_continuation",
        direction="bullish",
        confidence_score=78.0,
        confidence_level="high",
        evidence_scores={"bullish_bos": 90.0},
        entry_zone=TradeSetupZone(high=105.0, low=104.0, label="order_block"),
        stop_loss_zone=TradeSetupZone(high=104.0, low=102.0, label="stop_loss"),
        target_zones=[TradeSetupZone(high=107.0, low=106.5, label="target_1")],
        risk_reward=2.0,
        status="active",
        explanation="Trend continuation setup",
        reference_ids={},
        detected_at=datetime.now(UTC),
        engine_version="1.0.0",
        params_hash="abc",
    )
    mock_ts_service.list_active = AsyncMock(
        return_value=TradeSetupListResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            items=[record],
            total=1,
        )
    )
    response = await client.get(
        f"/api/v1/trade-setups/active/{symbol_id}?timeframe=1h&min_confidence=70"
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1


@pytest.mark.asyncio
async def test_details_endpoint(client: AsyncClient, mock_ts_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    record = TradeSetupRecord(
        setup_id="ts1",
        setup_type="breakout",
        direction="bullish",
        confidence_score=82.0,
        confidence_level="high",
        evidence_scores={},
        entry_zone=TradeSetupZone(high=105.0, low=104.0),
        stop_loss_zone=TradeSetupZone(high=104.0, low=102.0),
        target_zones=[],
        risk_reward=1.8,
        status="active",
        explanation="Breakout",
        reference_ids={},
        detected_at=datetime.now(UTC),
        engine_version="1.0.0",
        params_hash="abc",
    )
    mock_ts_service.get_details = AsyncMock(
        return_value=TradeSetupDetailResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            item=record,
        )
    )
    response = await client.get(
        f"/api/v1/trade-setups/details/{symbol_id}?timeframe=1h&setup_id=ts1"
    )
    assert response.status_code == 200
