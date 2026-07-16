"""Binance API constants."""

import os

# Public market-data host (works from more regions than api.binance.com).
# Override with BINANCE_BASE_URL if needed.
BASE_URL = os.environ.get("BINANCE_BASE_URL", "https://data-api.binance.vision").rstrip("/")
EXCHANGE_CODE = "binance"
MAX_KLINES_PER_REQUEST = 1000
DEFAULT_TIMEOUT = 30.0

# Canonical timeframe -> Binance interval
TIMEFRAME_MAP: dict[str, str] = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w",
}

SUPPORTED_TIMEFRAMES = list(TIMEFRAME_MAP.keys())
