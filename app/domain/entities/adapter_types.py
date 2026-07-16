"""Types returned by exchange adapters."""

from dataclasses import dataclass, field
from datetime import datetime, time
from decimal import Decimal

from app.domain.enums.market_type import MarketType
from app.domain.value_objects.timeframe import Timeframe


@dataclass(frozen=True, slots=True)
class Tick:
    symbol_code: str
    price: Decimal
    volume: Decimal
    timestamp: datetime
    side: str | None = None


@dataclass(frozen=True, slots=True)
class MarketSession:
    session_type: str
    open_time: time
    close_time: time
    timezone: str
    day_of_week: int | None = None


@dataclass(frozen=True, slots=True)
class ExchangeInfo:
    exchange_code: str
    name: str
    market_types: list[MarketType]
    supported_timeframes: list[Timeframe]
    rate_limit_per_minute: int
    status: str = "online"


@dataclass(frozen=True, slots=True)
class AdapterHealth:
    status: str
    latency_ms: float | None = None
    message: str | None = None


@dataclass(frozen=True, slots=True)
class ValidationResult:
    valid_candles: list
    rejected_count: int = 0
    rejection_reasons: list[str] = field(default_factory=list)
