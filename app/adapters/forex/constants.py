"""Forex / metals adapter constants (PAXGUSDT spot gold)."""

EXCHANGE_CODE = "forex"

# Binance spot kline intervals.
INTERVAL_MAP = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w",
}

FOREX_LOOKBACK_DAYS = {
    "1m": 7,
    "3m": 7,
    "5m": 14,
    "15m": 30,
    "30m": 45,
    "1h": 60,
    "4h": 90,
    "1d": 365,
    "1w": 730,
}
