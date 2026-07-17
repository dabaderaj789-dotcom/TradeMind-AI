"""NSE adapter constants."""

EXCHANGE_CODE = "nse"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_CHART_HOSTS = (
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
)
DEFAULT_TIMEOUT = 30.0
MAX_BARS_PER_REQUEST = 5000

# Yahoo interval mapping for supported timeframes.
INTERVAL_MAP = {
    "1m": "1m",
    "3m": "1m",  # Yahoo has no native 3m; aggregate 1m → 3m in adapter
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "60m",
    "4h": "60m",  # resampled by caller if needed; Yahoo has no native 4h
    "1d": "1d",
    "1w": "1wk",
}

# First-fill lookback when Neon has zero candles for this TF.
NSE_LOOKBACK_DAYS = {
    "1m": 7,
    "3m": 3,  # 1m→3m aggregate; keep short to avoid Yahoo/proxy timeouts
    "5m": 14,
    "15m": 30,
    "30m": 45,
    "1h": 60,
    "4h": 90,
    "1d": 365,
    "1w": 730,
}
