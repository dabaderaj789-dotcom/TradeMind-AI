"""API tests for Order Block endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_order_block_service
from app.schemas.order_block import (
    OrderBlockExecuteResponse,
    OrderBlockListResponse,
    OrderBlockRecord,
)


@pytest.fixture
def mock_ob_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def ob_client(app, mock_ob_service: AsyncMock):
    app.dependency_overrides[get_order_block_service] = lambda: mock_ob_service
    yield app
    app.dependency_overrides.pop(get_order_block_service, None)


@pytest.fixture
async def client(ob_client) -> AsyncClient:
    transport = ASGITransport(app=ob_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_execute_endpoint(client: AsyncClient, mock_ob_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ob_service.execute = AsyncMock(
        return_value=OrderBlockExecuteResponse(
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
        "/api/v1/order-blocks/execute",
        json={"symbol_id": str(symbol_id), "timeframe": "1h"},
    )
    assert response.status_code == 200
    assert response.json()["bars_persisted"] == 500


@pytest.mark.asyncio
async def test_active_endpoint(client: AsyncClient, mock_ob_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ob_service.get_active = AsyncMock(
        return_value=OrderBlockListResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            as_of=datetime.now(UTC),
            items=[
                OrderBlockRecord(
                    order_block_id="ob1",
                    type="bullish",
                    zone_high=105.0,
                    zone_low=100.0,
                    status="fresh",
                    mitigation_state="untouched",
                    touch_count=0,
                    strength_score=72.5,
                    strength_components={"bos_strength": 80.0},
                    confidence=0.85,
                    explanation="Bullish OB before BOS",
                    created_at=datetime.now(UTC),
                    timeframe_code="1h",
                )
            ],
            total=1,
        )
    )
    response = await client.get(f"/api/v1/order-blocks/active/{symbol_id}?timeframe=1h")
    assert response.status_code == 200
    assert response.json()["total"] == 1


@pytest.mark.asyncio
async def test_mitigated_endpoint(client: AsyncClient, mock_ob_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ob_service.get_mitigated = AsyncMock(
        return_value=OrderBlockListResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            items=[],
            total=0,
        )
    )
    response = await client.get(f"/api/v1/order-blocks/mitigated/{symbol_id}?timeframe=1h")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_invalidated_endpoint(client: AsyncClient, mock_ob_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_ob_service.get_invalidated = AsyncMock(
        return_value=OrderBlockListResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            items=[],
            total=0,
        )
    )
    response = await client.get(f"/api/v1/order-blocks/invalidated/{symbol_id}?timeframe=1h")
    assert response.status_code == 200
