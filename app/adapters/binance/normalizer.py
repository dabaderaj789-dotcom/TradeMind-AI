"""Binance API response normalization to domain objects."""

from datetime import UTC, datetime
from decimal import Decimal

from app.adapters.binance.constants import EXCHANGE_CODE, TIMEFRAME_MAP
from app.domain.entities.candle import Candle
from app.domain.entities.symbol import Symbol
from app.domain.enums.market_type import MarketType
from app.domain.value_objects.timeframe import TIMEFRAME_SECONDS


def normalize_symbol(raw: dict) -> Symbol | None:
    """Convert Binance exchangeInfo symbol entry to domain Symbol."""
    if raw.get("status") != "TRADING":
        return None
    if raw.get("quoteAsset") != "USDT":
        return None

    filters = {f["filterType"]: f for f in raw.get("filters", [])}
    lot_filter = filters.get("LOT_SIZE", {})
    price_filter = filters.get("PRICE_FILTER", {})

    tick_size = Decimal(price_filter.get("tickSize", "0.01"))
    lot_size = int(Decimal(lot_filter.get("minQty", "1")))

    return Symbol(
        symbol_code=raw["symbol"],
        name=f"{raw.get('baseAsset', '')}/{raw.get('quoteAsset', '')}",
        exchange_code=EXCHANGE_CODE,
        market_type=MarketType.CRYPTO,
        base_asset=raw.get("baseAsset"),
        quote_asset=raw.get("quoteAsset"),
        tick_size=tick_size,
        lot_size=max(lot_size, 1),
        is_active=True,
        metadata={"binance_status": raw.get("status")},
    )


def normalize_kline(raw: list, symbol_code: str, timeframe_code: str) -> Candle:
    """Convert Binance kline array to domain Candle."""
    open_time = datetime.fromtimestamp(raw[0] / 1000, tz=UTC)
    close_time = datetime.fromtimestamp(raw[6] / 1000, tz=UTC)
    # Forming bars have close_time still in the future — never mark them complete.
    is_complete = close_time <= datetime.now(UTC)

    return Candle(
        symbol_code=symbol_code,
        timeframe_code=timeframe_code,
        open_time=open_time,
        close_time=close_time,
        open=Decimal(raw[1]),
        high=Decimal(raw[2]),
        low=Decimal(raw[3]),
        close=Decimal(raw[4]),
        volume=Decimal(raw[5]),
        quote_volume=Decimal(raw[7]),
        trades_count=int(raw[8]),
        is_complete=is_complete,
        source="historical",
    )


def to_binance_interval(timeframe_code: str) -> str:
    """Map canonical timeframe to Binance interval string."""
    interval = TIMEFRAME_MAP.get(timeframe_code)
    if interval is None:
        raise ValueError(f"Unsupported timeframe for Binance: {timeframe_code}")
    return interval


def compute_close_time(open_time: datetime, timeframe_code: str) -> datetime:
    """Compute candle close time from open time and timeframe."""
    from datetime import timedelta

    seconds = TIMEFRAME_SECONDS[timeframe_code]
    return open_time + timedelta(seconds=seconds)
