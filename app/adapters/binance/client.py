"""Async HTTP client for Binance REST API."""

from datetime import datetime
from typing import Any

import httpx
from loguru import logger

from app.adapters.binance.constants import BASE_URL, DEFAULT_TIMEOUT, MAX_KLINES_PER_REQUEST
from app.core.exceptions import AdapterError, RateLimitError


class BinanceClient:
    """Low-level Binance REST client with rate-limit handling."""

    def __init__(self, base_url: str = BASE_URL, timeout: float = DEFAULT_TIMEOUT) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(method, url, **kwargs)

        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", "60"))
            raise RateLimitError("binance", retry_after=retry_after)

        if response.status_code >= 400:
            logger.warning("Binance API error {}: {}", response.status_code, response.text)
            raise AdapterError(
                "Binance API request failed",
                detail=f"status={response.status_code}, body={response.text[:200]}",
            )

        return response.json()

    async def get_exchange_info(self) -> dict:
        return await self._request("GET", "/api/v3/exchangeInfo")

    async def get_klines(
        self,
        symbol: str,
        interval: str,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = MAX_KLINES_PER_REQUEST,
    ) -> list[list]:
        params: dict[str, Any] = {
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": min(limit, MAX_KLINES_PER_REQUEST),
        }
        if start_time is not None:
            params["startTime"] = int(start_time.timestamp() * 1000)
        if end_time is not None:
            params["endTime"] = int(end_time.timestamp() * 1000)

        return await self._request("GET", "/api/v3/klines", params=params)

    async def get_ticker_price(self, symbol: str) -> float:
        """Last traded price from Binance spot ticker (matches TradingView Binance feed)."""
        data = await self._request(
            "GET",
            "/api/v3/ticker/price",
            params={"symbol": symbol.upper()},
        )
        return float(data["price"])

    async def ping(self) -> dict:
        return await self._request("GET", "/api/v3/ping")

    async def close(self) -> None:
        """No-op for stateless client; reserved for future persistent connection."""
