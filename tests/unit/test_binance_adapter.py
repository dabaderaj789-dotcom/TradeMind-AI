"""Tests for Binance adapter."""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.adapters.binance.adapter import BinanceAdapter
from app.core.exceptions import StreamingNotSupportedError, SymbolNotFoundError
from app.domain.value_objects.timeframe import parse_timeframe


@pytest.fixture
def mock_client() -> AsyncMock:
    client = AsyncMock()
    client.ping = AsyncMock(return_value={})
    return client


@pytest.fixture
def adapter(mock_client: AsyncMock) -> BinanceAdapter:
    return BinanceAdapter(client=mock_client)


@pytest.mark.asyncio
async def test_health_check_healthy(adapter: BinanceAdapter, mock_client: AsyncMock) -> None:
    health = await adapter.health_check()
    assert health.status == "healthy"
    mock_client.ping.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_historical_data_paginates(adapter: BinanceAdapter, mock_client: AsyncMock) -> None:
    tf = parse_timeframe("1h")
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = datetime(2024, 1, 3, tzinfo=UTC)

    mock_client.get_klines = AsyncMock(
        side_effect=[
            [[
                1704067200000, "42000", "42500", "41800", "42200",
                "100", 1704070799999, "4200000", 500, "0", "0", "0",
            ]] * 1000,
            [],
        ]
    )

    candles = await adapter.get_historical_data("BTCUSDT", tf, start, end)
    assert len(candles) == 1000
    assert mock_client.get_klines.await_count == 2


@pytest.mark.asyncio
async def test_get_symbol_not_found(adapter: BinanceAdapter, mock_client: AsyncMock) -> None:
    mock_client.get_exchange_info = AsyncMock(return_value={"symbols": []})
    with pytest.raises(SymbolNotFoundError):
        await adapter.ensure_symbol_exists("UNKNOWN")


@pytest.mark.asyncio
async def test_subscribe_ticks_not_implemented(adapter: BinanceAdapter) -> None:
    with pytest.raises(StreamingNotSupportedError):
        async for _ in adapter.subscribe_ticks(["BTCUSDT"]):
            pass
