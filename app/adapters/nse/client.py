"""Yahoo Finance client used by the NSE adapter for historical bars."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from app.adapters.nse.constants import DEFAULT_TIMEOUT, INTERVAL_MAP, YAHOO_CHART_URL
from app.core.exceptions import AdapterError


class NseYahooClient:
    """Thin HTTP client for Yahoo chart endpoints (NSE / BSE tickers)."""

    def __init__(self, timeout: float = DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout

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
        url = YAHOO_CHART_URL.format(symbol=yahoo_ticker)
        headers = {"User-Agent": "TradeMindAI/1.0 (NSE adapter)"}

        try:
            async with httpx.AsyncClient(timeout=self._timeout, headers=headers) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as exc:
            raise AdapterError(
                "NSE Yahoo chart request failed",
                detail=f"ticker={yahoo_ticker} interval={interval} error={exc}",
            ) from exc

    @staticmethod
    def to_interval(timeframe_code: str) -> str:
        return INTERVAL_MAP.get(timeframe_code, "1d")
