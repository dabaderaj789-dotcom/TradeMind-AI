"""Pydantic schemas for market data API."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema, PaginatedResponse


class ExchangeResponse(BaseSchema):
    id: UUID
    code: str
    name: str
    country: str | None = None
    timezone: str
    market_types: list[str]
    is_active: bool


class SymbolResponse(BaseSchema):
    id: UUID
    exchange_code: str
    exchange_name: str
    market_code: str
    market_type: str
    symbol_code: str
    name: str
    base_asset: str | None = None
    quote_asset: str | None = None
    tick_size: Decimal
    lot_size: int
    is_active: bool
    # Instrument class from adapter metadata (index, equity, etf, futures, sector_index).
    instrument: str | None = None


class CandleResponse(BaseSchema):
    symbol_id: UUID
    symbol_code: str
    timeframe: str
    open_time: datetime
    close_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    quote_volume: Decimal | None = None
    trades_count: int | None = None
    is_complete: bool
    source: str


class DownloadCandlesRequest(BaseSchema):
    symbol_id: UUID | None = None
    exchange_code: str | None = None
    symbol_code: str | None = None
    timeframe: str = Field(description="Canonical timeframe: 1m, 5m, 15m, 1h, 4h, 1d, 1w")
    start: datetime | None = Field(default=None, description="Start time UTC; defaults for incremental")
    end: datetime | None = Field(default=None, description="End time UTC; defaults to now")
    incremental: bool = Field(
        default=True,
        description="If true, download from latest stored candle forward",
    )


class DownloadCandlesResponse(BaseSchema):
    symbol_id: UUID
    symbol_code: str
    exchange_code: str
    timeframe: str
    downloaded: int
    inserted: int
    rejected: int
    start: datetime
    end: datetime
    incremental: bool


class SyncSymbolsRequest(BaseSchema):
    exchange_code: str = "binance"


class SyncSymbolsResponse(BaseSchema):
    exchange_code: str
    total_fetched: int
    created: int
    updated: int


class CandleListResponse(BaseSchema):
    items: list[CandleResponse]
    total: int
    symbol_id: UUID
    timeframe: str


PaginatedExchangeResponse = PaginatedResponse[ExchangeResponse]
PaginatedSymbolResponse = PaginatedResponse[SymbolResponse]
