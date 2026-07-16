"""API tests for Strategy and Backtesting endpoints."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_backtest_service, get_strategy_service
from app.schemas.strategy_backtest import (
    BacktestStartResponse,
    BacktestStatusResponse,
    PerformanceReportResponse,
    StrategyExecuteResponse,
    StrategyListResponse,
    StrategyMetadataResponse,
)


@pytest.fixture
def mock_strategy_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def mock_backtest_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def sb_client(app, mock_strategy_service: AsyncMock, mock_backtest_service: AsyncMock):
    app.dependency_overrides[get_strategy_service] = lambda: mock_strategy_service
    app.dependency_overrides[get_backtest_service] = lambda: mock_backtest_service
    yield app
    app.dependency_overrides.pop(get_strategy_service, None)
    app.dependency_overrides.pop(get_backtest_service, None)


@pytest.fixture
async def client(sb_client) -> AsyncClient:
    transport = ASGITransport(app=sb_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_strategies(client: AsyncClient, mock_strategy_service: AsyncMock) -> None:
    mock_strategy_service.list_strategies = AsyncMock(
        return_value=StrategyListResponse(
            items=[
                StrategyMetadataResponse(
                    strategy_id="trend_continuation",
                    strategy_name="Trend Continuation",
                    strategy_version="1.0.0",
                    description="Test",
                    supported_markets=["crypto"],
                    supported_timeframes=["1h"],
                    required_setup_types=["trend_continuation"],
                    default_parameters={},
                )
            ],
            total=1,
        )
    )
    response = await client.get("/api/v1/strategies")
    assert response.status_code == 200
    assert response.json()["total"] == 1


@pytest.mark.asyncio
async def test_execute_strategy(client: AsyncClient, mock_strategy_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_strategy_service.execute = AsyncMock(
        return_value=StrategyExecuteResponse(
            symbol_id=symbol_id,
            timeframe="1h",
            strategy_id="trend_continuation",
            strategy_version="1.0.0",
            params_hash="abc",
            plans_generated=2,
            setups_evaluated=5,
            setups_rejected=3,
        )
    )
    response = await client.post(
        "/api/v1/strategies/execute",
        json={
            "symbol_id": str(symbol_id),
            "timeframe": "1h",
            "strategy_id": "trend_continuation",
        },
    )
    assert response.status_code == 200
    assert response.json()["plans_generated"] == 2


@pytest.mark.asyncio
async def test_start_backtest(client: AsyncClient, mock_backtest_service: AsyncMock) -> None:
    run_id = uuid.uuid4()
    mock_backtest_service.start = AsyncMock(
        return_value=BacktestStartResponse(
            run_id=run_id,
            status="completed",
            strategy_id="breakout",
            engine_version="1.0.0",
            params_hash="xyz",
        )
    )
    response = await client.post(
        "/api/v1/backtests/start",
        json={
            "symbol_id": str(uuid.uuid4()),
            "timeframe": "1h",
            "strategy_id": "breakout",
        },
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_backtest_report(client: AsyncClient, mock_backtest_service: AsyncMock) -> None:
    run_id = uuid.uuid4()
    mock_backtest_service.get_report = AsyncMock(
        return_value=PerformanceReportResponse(
            run_id=run_id,
            metrics={"net_profit": 500.0, "win_rate": 55.0},
            equity_curve=[{"equity": 10000}],
            monthly_returns={},
            yearly_returns={},
            walk_forward_segments=[],
            generated_at=datetime.now(UTC),
        )
    )
    response = await client.get(f"/api/v1/backtests/{run_id}/report")
    assert response.status_code == 200
