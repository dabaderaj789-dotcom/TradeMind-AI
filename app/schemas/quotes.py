"""Schemas for live session quotes (Trading Terminal MarketQuoteBar)."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class MarketQuoteResponse(BaseSchema):
    symbol_id: UUID
    symbol_code: str
    current_price: float
    day_open: float
    day_high: float
    day_low: float
    prev_close: float
    prev_day_high: float
    prev_day_low: float
    day_change: float
    day_change_pct: float
    day_range: float
    volume: float
    avg_volume: float
    vwap: float
    market_status: Literal["OPEN", "CLOSED"]
    last_updated: datetime
    provider: str
    source: str
    reference_note: str | None = None
    yahoo_ticker: str | None = None


class QuoteCheck(BaseSchema):
    field: str
    ours: float | str
    reference: float | str
    pct_diff: float
    tolerance_pct: float
    unit: str | None = None


class QuoteVerificationResponse(BaseSchema):
    ok: bool
    mismatches: int
    checks: list[QuoteCheck]
    reference_provider: str
    compared_at: datetime


class QuoteVerifyResponse(BaseSchema):
    quote: MarketQuoteResponse
    verification: QuoteVerificationResponse


class OhlcCompareResponse(BaseSchema):
    symbol_id: UUID
    symbol_code: str
    timeframe: str
    our_source: str
    reference_provider: str
    reference_note: str
    yahoo_ticker: str | None = None
    comparison: dict[str, Any]
    our_sample: list[dict[str, Any]]
    reference_sample: list[dict[str, Any]]
