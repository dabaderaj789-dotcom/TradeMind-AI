"""Domain OHLCV candle entity."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Candle:
    """Normalized OHLCV bar in UTC."""

    symbol_code: str
    timeframe_code: str
    open_time: datetime
    close_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    quote_volume: Decimal | None = None
    trades_count: int | None = None
    is_complete: bool = True
    source: str = "historical"
