"""API tests for Analysis Engine endpoints."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_analysis_service
from app.schemas.analysis import (
    ExecuteAnalysisResponse,
    PluginMetadataResponse,
    SymbolAnalysisResult,
)


@pytest.fixture
def mock_analysis_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def analysis_client(app, mock_analysis_service: AsyncMock):
    app.dependency_overrides[get_analysis_service] = lambda: mock_analysis_service
    yield app
    app.dependency_overrides.pop(get_analysis_service, None)


@pytest.fixture
async def client(analysis_client) -> AsyncClient:
    transport = ASGITransport(app=analysis_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_plugins(client: AsyncClient, mock_analysis_service: AsyncMock) -> None:
    mock_analysis_service.list_plugins = AsyncMock(
        return_value=[
            PluginMetadataResponse(
                plugin_id="rsi",
                plugin_name="Relative Strength Index",
                plugin_version="1.0.0",
                category="momentum",
                required_history=15,
                default_parameters={"period": 14},
                output_schema={"rsi": {"type": "number"}},
            )
        ]
    )
    response = await client.get("/api/v1/analysis/plugins")
    assert response.status_code == 200
    assert response.json()[0]["plugin_id"] == "rsi"


@pytest.mark.asyncio
async def test_execute_analysis(client: AsyncClient, mock_analysis_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_analysis_service.execute = AsyncMock(
        return_value=ExecuteAnalysisResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            computed_at=datetime.now(UTC),
            results=[
                SymbolAnalysisResult(
                    plugin_id="rsi",
                    plugin_version="1.0.0",
                    parameters={"period": 14},
                    params_hash="abc123",
                    success=True,
                    bars_computed=100,
                    bars_persisted=100,
                )
            ],
        )
    )
    response = await client.post(
        "/api/v1/analysis/execute",
        json={
            "symbol_id": str(symbol_id),
            "timeframe": "1h",
            "plugins": [{"plugin_id": "rsi", "parameters": {"period": 14}}],
        },
    )
    assert response.status_code == 200
    assert response.json()["results"][0]["success"] is True
