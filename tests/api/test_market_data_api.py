"""API tests for market data endpoints."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.api.deps import get_market_data_service
from app.schemas.market_data import (
    CandleListResponse,
    CandleResponse,
    DownloadCandlesResponse,
    ExchangeResponse,
    PaginatedExchangeResponse,
    PaginatedSymbolResponse,
    SyncSymbolsResponse,
    SymbolResponse,
)


@pytest.fixture
def mock_market_data_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def market_data_client(app, mock_market_data_service: AsyncMock):
    app.dependency_overrides[get_market_data_service] = lambda: mock_market_data_service
    yield app
    app.dependency_overrides.pop(get_market_data_service, None)


@pytest.fixture
async def md_client(market_data_client) -> AsyncClient:
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=market_data_client)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_list_exchanges(md_client: AsyncClient, mock_market_data_service: AsyncMock) -> None:
    exchange_id = uuid.uuid4()
    mock_market_data_service.list_exchanges = AsyncMock(
        return_value=PaginatedExchangeResponse(
            items=[
                ExchangeResponse(
                    id=exchange_id,
                    code="binance",
                    name="Binance Spot",
                    country=None,
                    timezone="UTC",
                    market_types=["crypto"],
                    is_active=True,
                )
            ],
            total=1,
            page=1,
            page_size=50,
            pages=1,
        )
    )

    response = await md_client.get("/api/v1/exchanges")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["code"] == "binance"


@pytest.mark.asyncio
async def test_list_symbols(md_client: AsyncClient, mock_market_data_service: AsyncMock) -> None:
    mock_market_data_service.list_symbols = AsyncMock(
        return_value=PaginatedSymbolResponse(
            items=[
                SymbolResponse(
                    id=uuid.uuid4(),
                    exchange_code="binance",
                    exchange_name="Binance Spot",
                    market_code="binance_crypto",
                    market_type="crypto",
                    symbol_code="BTCUSDT",
                    name="BTC/USDT",
                    base_asset="BTC",
                    quote_asset="USDT",
                    tick_size=Decimal("0.01"),
                    lot_size=1,
                    is_active=True,
                )
            ],
            total=1,
            page=1,
            page_size=50,
            pages=1,
        )
    )

    response = await md_client.get("/api/v1/symbols?exchange_code=binance")
    assert response.status_code == 200
    assert response.json()["items"][0]["symbol_code"] == "BTCUSDT"


@pytest.mark.asyncio
async def test_sync_symbols(md_client: AsyncClient, mock_market_data_service: AsyncMock) -> None:
    mock_market_data_service.sync_symbols = AsyncMock(
        return_value=SyncSymbolsResponse(
            exchange_code="binance",
            total_fetched=100,
            created=100,
            updated=0,
        )
    )

    response = await md_client.post("/api/v1/symbols/sync", json={"exchange_code": "binance"})
    assert response.status_code == 200
    assert response.json()["created"] == 100


@pytest.mark.asyncio
async def test_download_candles(md_client: AsyncClient, mock_market_data_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_market_data_service.download_candles = AsyncMock(
        return_value=DownloadCandlesResponse(
            symbol_id=symbol_id,
            symbol_code="BTCUSDT",
            exchange_code="binance",
            timeframe="1h",
            downloaded=720,
            inserted=720,
            rejected=0,
            start=datetime(2024, 1, 1, tzinfo=UTC),
            end=datetime(2024, 1, 31, tzinfo=UTC),
            incremental=True,
        )
    )

    response = await md_client.post(
        "/api/v1/candles/download",
        json={
            "exchange_code": "binance",
            "symbol_code": "BTCUSDT",
            "timeframe": "1h",
            "incremental": True,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["inserted"] == 720
    assert data["symbol_code"] == "BTCUSDT"


@pytest.mark.asyncio
async def test_get_candles(md_client: AsyncClient, mock_market_data_service: AsyncMock) -> None:
    symbol_id = uuid.uuid4()
    mock_market_data_service.get_candles = AsyncMock(
        return_value=CandleListResponse(
            items=[
                CandleResponse(
                    symbol_id=symbol_id,
                    symbol_code="BTCUSDT",
                    timeframe="1h",
                    open_time=datetime(2024, 1, 1, tzinfo=UTC),
                    close_time=datetime(2024, 1, 1, 1, 0, tzinfo=UTC),
                    open=Decimal("42000"),
                    high=Decimal("42500"),
                    low=Decimal("41800"),
                    close=Decimal("42200"),
                    volume=Decimal("100"),
                    is_complete=True,
                    source="historical",
                )
            ],
            total=1,
            symbol_id=symbol_id,
            timeframe="1h",
        )
    )

    response = await md_client.get(f"/api/v1/candles/{symbol_id}?timeframe=1h")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
