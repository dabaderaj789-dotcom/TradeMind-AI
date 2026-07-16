"""API tests for Replay Studio endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_replay_studio_service
from app.schemas.replay_studio import (
    ReplayFrameResponse,
    ReplaySessionResponse,
)


@pytest.fixture
def mock_replay_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def replay_client(app, mock_replay_service: AsyncMock):
    app.dependency_overrides[get_replay_studio_service] = lambda: mock_replay_service
    yield app
    app.dependency_overrides.pop(get_replay_studio_service, None)


@pytest.fixture
async def client(replay_client) -> AsyncClient:
    transport = ASGITransport(app=replay_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_create_session(client: AsyncClient, mock_replay_service: AsyncMock) -> None:
    sid = uuid.uuid4()
    sym = uuid.uuid4()
    mock_replay_service.create_session = AsyncMock(
        return_value=ReplaySessionResponse(
            session_id=sid,
            symbol_id=sym,
            symbol_code="BTCUSDT",
            timeframe="1h",
            total_bars=500,
            current_index=0,
            current_time=datetime.now(UTC),
            playback_state="paused",
            replay_speed=1.0,
            debug_mode=False,
            events_count=12,
            engine_version="1.0.0",
        )
    )
    response = await client.post(
        "/api/v1/replay-studio/sessions",
        json={"symbol_id": str(sym), "timeframe": "1h"},
    )
    assert response.status_code == 200
    assert response.json()["total_bars"] == 500


@pytest.mark.asyncio
async def test_step_forward(client: AsyncClient, mock_replay_service: AsyncMock) -> None:
    sid = uuid.uuid4()
    mock_replay_service.step_forward = AsyncMock(
        return_value=ReplayFrameResponse(
            session_id=sid,
            current_index=1,
            total_bars=100,
            current_time=datetime.now(UTC),
            playback_state="paused",
            replay_speed=1.0,
            candles=[{"time": 1, "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 10}],
            overlays={},
            visible_events=[],
        )
    )
    response = await client.post(
        f"/api/v1/replay-studio/sessions/{sid}/step-forward",
        json={"steps": 1},
    )
    assert response.status_code == 200
    assert response.json()["current_index"] == 1
