"""Generate synthetic OHLCV candle bars for analysis tests."""

from datetime import UTC, datetime, timedelta

from app.engines.analysis.types import CandleBar


def generate_trending_candles(count: int = 200, start_price: float = 100.0) -> list[CandleBar]:
    """Generate synthetic trending candles with realistic OHLCV."""
    candles: list[CandleBar] = []
    price = start_price
    base_time = datetime(2024, 1, 1, tzinfo=UTC)

    for i in range(count):
        open_time = base_time + timedelta(hours=i)
        close_time = open_time + timedelta(hours=1)
        drift = (i % 7 - 3) * 0.5
        open_p = price
        close_p = price + drift + (i % 5) * 0.1
        high_p = max(open_p, close_p) + 1.5
        low_p = min(open_p, close_p) - 1.5
        volume = 1000 + (i % 50) * 100
        candles.append(
            CandleBar(
                open_time=open_time,
                close_time=close_time,
                open=open_p,
                high=high_p,
                low=low_p,
                close=close_p,
                volume=float(volume),
            )
        )
        price = close_p

    return candles
