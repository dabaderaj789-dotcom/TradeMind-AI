"""Normalized market-data contracts shared by every provider adapter.

Chart, option chain, and AI services consume only these types — never
broker-specific payloads.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal


class ProviderId(StrEnum):
    """Stable provider identifiers used in config and API responses."""

    YAHOO_NSE = "yahoo_nse"
    BINANCE = "binance"
    ANGEL = "angel"
    UPSTOX = "upstox"
    DHAN = "dhan"
    ZERODHA = "zerodha"
    TRUEDATA = "truedata"
    GLOBAL_DATAFEEDS = "global_datafeeds"


class ProviderCapability(StrEnum):
    TICKS = "ticks"
    STREAMING = "streaming"
    OHLC = "ohlc"
    VOLUME = "volume"
    OPTION_CHAIN = "option_chain"
    OI = "oi"
    GREEKS = "greeks"
    INSTRUMENTS = "instruments"
    HISTORICAL = "historical"


@dataclass(frozen=True, slots=True)
class NormalizedTick:
    """Last trade / last price snapshot."""

    symbol_code: str
    last: Decimal
    timestamp: datetime
    exchange: str = ""
    volume: Decimal | None = None
    bid: Decimal | None = None
    ask: Decimal | None = None
    oi: Decimal | None = None
    provider: str = ""
    source: str = ""
    market_status: Literal["OPEN", "CLOSED"] = "OPEN"


@dataclass(frozen=True, slots=True)
class NormalizedOHLC:
    """Single OHLCV(+OI) bar in UTC."""

    symbol_code: str
    timeframe: str
    open_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    close_time: datetime | None = None
    oi: Decimal | None = None
    is_complete: bool = True
    provider: str = ""
    source: str = ""


@dataclass(frozen=True, slots=True)
class NormalizedGreeks:
    delta: Decimal | None = None
    gamma: Decimal | None = None
    theta: Decimal | None = None
    vega: Decimal | None = None
    iv: Decimal | None = None


@dataclass(frozen=True, slots=True)
class NormalizedOptionLeg:
    strike: Decimal
    option_type: Literal["CE", "PE"]
    ltp: Decimal | None = None
    bid: Decimal | None = None
    ask: Decimal | None = None
    volume: Decimal | None = None
    oi: Decimal | None = None
    oi_change: Decimal | None = None
    greeks: NormalizedGreeks | None = None


@dataclass(frozen=True, slots=True)
class NormalizedOptionStrike:
    strike: Decimal
    moneyness: Literal["ITM", "ATM", "OTM"]
    call: NormalizedOptionLeg
    put: NormalizedOptionLeg


@dataclass(frozen=True, slots=True)
class NormalizedOptionChain:
    underlying: str
    as_of: datetime
    spot: Decimal | None = None
    futures: Decimal | None = None
    atm_strike: Decimal | None = None
    expiry: str | None = None
    expiries: list[str] = field(default_factory=list)
    rows: list[NormalizedOptionStrike] = field(default_factory=list)
    provider: str = ""
    source: str = ""
    reference_note: str = ""


@dataclass(frozen=True, slots=True)
class InstrumentMetadata:
    """Provider-agnostic instrument descriptor."""

    symbol_code: str
    name: str
    exchange: str
    segment: str  # EQ | FO | INDEX | CRYPTO | CDS | MCX | ...
    instrument_type: str  # equity | index | future | option | crypto | forex
    lot_size: int | None = None
    tick_size: Decimal | None = None
    expiry: str | None = None
    strike: Decimal | None = None
    option_type: Literal["CE", "PE"] | None = None
    provider_token: str | None = None
    tradingsymbol: str | None = None
    provider: str = ""
    extra: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ProviderHealth:
    provider: str
    status: Literal["ok", "degraded", "down", "not_configured"]
    latency_ms: float | None = None
    message: str | None = None
    capabilities: tuple[str, ...] = ()
