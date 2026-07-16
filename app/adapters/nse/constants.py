"""NSE adapter constants."""

EXCHANGE_CODE = "nse"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
DEFAULT_TIMEOUT = 20.0
MAX_BARS_PER_REQUEST = 5000

# Yahoo interval mapping for supported timeframes.
INTERVAL_MAP = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "60m",
    "4h": "60m",  # resampled by caller if needed; Yahoo has no native 4h
    "1d": "1d",
    "1w": "1wk",
}
