"""Yahoo Finance client used by the NSE adapter for historical bars.

Handles rate limits with exponential backoff, crumb/cookie auth, and
alternate hosts. Falls back to NSE India chart API when Yahoo is blocked.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx
from loguru import logger

from app.adapters.nse.constants import DEFAULT_TIMEOUT, INTERVAL_MAP, YAHOO_CHART_HOSTS
from app.core.exceptions import AdapterError, RateLimitError

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)

# Global throttle across NSE Yahoo calls (shared process on Railway).
_last_request_monotonic = 0.0
_min_interval_sec = 1.25
_lock = asyncio.Lock()


class NseYahooClient:
    """HTTP client for Yahoo chart + NSE India chart fallbacks."""

    def __init__(self, timeout: float = DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout
        self._crumb: str | None = None
        self._cookies: httpx.Cookies | None = None
        self._crumb_at = 0.0

    async def get_chart(
        self,
        yahoo_ticker: str,
        *,
        interval: str,
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)

        params = {
            "interval": interval,
            "period1": int(start.timestamp()),
            "period2": int(end.timestamp()),
            "includePrePost": "false",
            "events": "div,splits",
        }

        last_exc: Exception | None = None
        delays = [0.0, 1.5, 3.0, 6.0, 12.0, 24.0]

        for attempt, delay in enumerate(delays):
            if delay:
                await asyncio.sleep(delay)
            try:
                await self._throttle()
                payload = await self._yahoo_request(yahoo_ticker, params)
                if self._has_bars(payload):
                    return payload
                logger.warning(
                    "Yahoo returned empty chart for {} {} (attempt {})",
                    yahoo_ticker,
                    interval,
                    attempt + 1,
                )
            except RateLimitError as exc:
                last_exc = exc
                logger.warning(
                    "Yahoo 429 for {} {} attempt {} — backing off",
                    yahoo_ticker,
                    interval,
                    attempt + 1,
                )
                # Force crumb refresh after rate limit.
                self._crumb = None
                self._cookies = None
            except AdapterError as exc:
                last_exc = exc
                logger.warning("Yahoo request failed: {}", exc.detail)

        # Fallback: NSE India official chart (indices + some equities).
        try:
            await self._throttle()
            nse_payload = await self._nse_india_chart(yahoo_ticker, interval, start, end)
            if self._has_bars(nse_payload):
                logger.info("NSE India fallback succeeded for {}", yahoo_ticker)
                return nse_payload
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            logger.warning("NSE India fallback failed for {}: {}", yahoo_ticker, exc)

        raise AdapterError(
            "NSE Yahoo chart request failed",
            detail=(
                f"ticker={yahoo_ticker} interval={interval} "
                f"error={last_exc or 'empty chart after retries'}"
            ),
        )

    async def _yahoo_request(self, yahoo_ticker: str, params: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_crumb()
        headers = {
            "User-Agent": _BROWSER_UA,
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        }
        req_params = dict(params)
        if self._crumb:
            req_params["crumb"] = self._crumb

        encoded = quote(yahoo_ticker, safe="")
        errors: list[str] = []

        async with httpx.AsyncClient(
            timeout=self._timeout,
            headers=headers,
            cookies=self._cookies,
            follow_redirects=True,
        ) as client:
            for host in YAHOO_CHART_HOSTS:
                url = f"{host}/v8/finance/chart/{encoded}"
                response = await client.get(url, params=req_params)
                if response.status_code == 429:
                    errors.append(f"{host}→429")
                    raise RateLimitError("yahoo", retry_after=30)
                if response.status_code >= 400:
                    errors.append(f"{host}→{response.status_code}")
                    continue
                try:
                    return response.json()
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{host}→bad_json:{exc}")
                    continue

        raise AdapterError(
            "NSE Yahoo chart request failed",
            detail=f"ticker={yahoo_ticker} hosts={'; '.join(errors)}",
        )

    async def _ensure_crumb(self) -> None:
        # Refresh crumb every 30 minutes.
        if self._crumb and (time.monotonic() - self._crumb_at) < 1800:
            return
        headers = {"User-Agent": _BROWSER_UA}
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout,
                headers=headers,
                follow_redirects=True,
            ) as client:
                # Establish consent / session cookies.
                await client.get("https://fc.yahoo.com")
                crumb_resp = await client.get("https://query1.finance.yahoo.com/v1/test/getcrumb")
                if crumb_resp.status_code == 200 and crumb_resp.text:
                    self._crumb = crumb_resp.text.strip().strip('"')
                    self._cookies = client.cookies
                    self._crumb_at = time.monotonic()
                    logger.debug("Yahoo crumb acquired")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Yahoo crumb bootstrap failed (continuing without): {}", exc)

    async def _nse_india_chart(
        self,
        yahoo_ticker: str,
        interval: str,
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Map Yahoo tickers to NSE India chart-databyindex when possible."""
        index_name = _yahoo_to_nse_index(yahoo_ticker)
        if not index_name:
            raise AdapterError("No NSE India mapping", detail=yahoo_ticker)

        headers = {
            "User-Agent": _BROWSER_UA,
            "Accept": "application/json",
            "Referer": "https://www.nseindia.com/",
        }
        async with httpx.AsyncClient(
            timeout=self._timeout,
            headers=headers,
            follow_redirects=True,
        ) as client:
            # Seed cookies required by nseindia.com APIs.
            await client.get("https://www.nseindia.com/")
            await client.get("https://www.nseindia.com/market-data/live-equity-market")
            url = "https://www.nseindia.com/api/chart-databyindex"
            response = await client.get(url, params={"index": index_name})
            if response.status_code == 429:
                raise RateLimitError("nseindia", retry_after=60)
            response.raise_for_status()
            raw = response.json()

        return _nse_india_to_yahoo_shape(raw, interval, start, end)

    @staticmethod
    def to_interval(timeframe_code: str) -> str:
        return INTERVAL_MAP.get(timeframe_code, "1d")

    @staticmethod
    def _has_bars(payload: dict[str, Any]) -> bool:
        try:
            result = payload["chart"]["result"][0]
            return bool(result.get("timestamp"))
        except (KeyError, IndexError, TypeError):
            return False

    async def _throttle(self) -> None:
        global _last_request_monotonic
        async with _lock:
            now = time.monotonic()
            wait = _min_interval_sec - (now - _last_request_monotonic)
            if wait > 0:
                await asyncio.sleep(wait)
            _last_request_monotonic = time.monotonic()


def _yahoo_to_nse_index(yahoo_ticker: str) -> str | None:
    mapping = {
        "^NSEI": "NIFTY 50",
        "^NSEBANK": "NIFTY BANK",
        "^CNXFIN": "NIFTY FINANCIAL SERVICES",
        "^BSESN": "SENSEX",
    }
    return mapping.get(yahoo_ticker.upper())


def _nse_india_to_yahoo_shape(
    raw: Any,
    interval: str,
    start: datetime,
    end: datetime,
) -> dict[str, Any]:
    """Convert NSE chart-databyindex JSON into Yahoo-like chart payload."""
    # NSE returns grapthData as [[epoch_ms, price], ...] — typically ~1m resolution.
    series: list[list[Any]] = []
    if isinstance(raw, dict):
        series = raw.get("grapthData") or raw.get("graphData") or raw.get("data") or []
    if not series:
        return {"chart": {"result": []}}

    # Bucket by interval seconds.
    seconds = {
        "1m": 60,
        "2m": 120,
        "5m": 300,
        "15m": 900,
        "30m": 1800,
        "60m": 3600,
        "1h": 3600,
        "1d": 86400,
        "1wk": 604800,
    }.get(interval, 86400)

    buckets: dict[int, dict[str, float]] = {}
    for row in series:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        try:
            ts_ms = int(row[0])
            price = float(row[1])
        except (TypeError, ValueError):
            continue
        open_time = datetime.fromtimestamp(ts_ms / 1000, tz=UTC)
        if open_time < start or open_time > end:
            continue
        bucket_ts = int(open_time.timestamp()) // seconds * seconds
        b = buckets.get(bucket_ts)
        if b is None:
            buckets[bucket_ts] = {
                "open": price,
                "high": price,
                "low": price,
                "close": price,
                "volume": 0.0,
            }
        else:
            b["high"] = max(b["high"], price)
            b["low"] = min(b["low"], price)
            b["close"] = price

    if not buckets:
        return {"chart": {"result": []}}

    timestamps = sorted(buckets.keys())
    opens = [buckets[t]["open"] for t in timestamps]
    highs = [buckets[t]["high"] for t in timestamps]
    lows = [buckets[t]["low"] for t in timestamps]
    closes = [buckets[t]["close"] for t in timestamps]
    volumes = [buckets[t]["volume"] for t in timestamps]

    return {
        "chart": {
            "result": [
                {
                    "timestamp": timestamps,
                    "indicators": {
                        "quote": [
                            {
                                "open": opens,
                                "high": highs,
                                "low": lows,
                                "close": closes,
                                "volume": volumes,
                            }
                        ]
                    },
                }
            ]
        }
    }
