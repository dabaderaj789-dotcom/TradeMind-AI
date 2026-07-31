"""V7 market-data latency + option-chain + accuracy probe schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class LatencyProbe(BaseSchema):
    """Timestamps for end-to-end latency debugging."""

    provider_ts: datetime | None = None
    backend_received_at: datetime | None = None
    backend_sent_at: datetime | None = None
    feed_delay_ms: float | None = None
    backend_delay_ms: float | None = None
    source: str | None = None
    bottleneck: str | None = Field(
        default=None,
        description="Largest contributor: provider_feed | backend | transport | unknown",
    )


class TickQuoteResponse(BaseSchema):
    """Lightweight last-price for high-frequency tip painting."""

    symbol_id: UUID
    symbol_code: str
    price: float
    volume: float | None = None
    market_status: Literal["OPEN", "CLOSED"]
    last_updated: datetime
    provider: str
    source: str
    latency: LatencyProbe


class OptionLegQuote(BaseSchema):
    strike: float
    option_type: Literal["CE", "PE"]
    bid: float | None = None
    ask: float | None = None
    ltp: float | None = None
    volume: float | None = None
    oi: float | None = None
    oi_change: float | None = None
    iv: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None


class OptionStrikeRow(BaseSchema):
    strike: float
    moneyness: Literal["ITM", "ATM", "OTM"]
    call: OptionLegQuote
    put: OptionLegQuote


class OptionChainResponse(BaseSchema):
    underlying: str
    spot: float | None = None
    futures: float | None = None
    atm_strike: float | None = None
    expiry: str | None = None
    expiries: list[str] = Field(default_factory=list)
    rows: list[OptionStrikeRow] = Field(default_factory=list)
    as_of: datetime
    source: str
    reference_note: str
    latency: LatencyProbe | None = None


class AccuracySymbolResult(BaseSchema):
    symbol_code: str
    exchange: str
    ours: float | None = None
    reference: float | None = None
    reference_provider: str
    price_diff: float | None = None
    price_diff_pct: float | None = None
    ok: bool
    note: str | None = None


class MarketAccuracyReport(BaseSchema):
    generated_at: datetime
    results: list[AccuracySymbolResult]
    summary: dict[str, Any]
    limitations: list[str]
