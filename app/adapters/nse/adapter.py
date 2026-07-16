"""NSE (National Stock Exchange of India) market data adapter."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, time as dt_time, timedelta

from loguru import logger

from app.adapters.base import ExchangeAdapter
from app.adapters.nse.client import NseYahooClient
from app.adapters.nse.constants import EXCHANGE_CODE
from app.adapters.nse.normalizer import normalize_yahoo_chart
from app.adapters.nse.symbols import build_nse_symbols, yahoo_ticker_for
from app.core.exceptions import SymbolNotFoundError
from app.domain.entities.adapter_types import AdapterHealth, ExchangeInfo, MarketSession
from app.domain.entities.candle import Candle
from app.domain.entities.symbol import Symbol
from app.domain.enums.market_type import MarketType
from app.domain.value_objects.timeframe import Timeframe, parse_timeframe

SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"]


class NseAdapter(ExchangeAdapter):
    """NSE equities & indices via Yahoo Finance chart feed.

    Symbol catalog covers NIFTY 50, BANKNIFTY, FINNIFTY, SENSEX and NSE
    equities. Historical bars are fetched from Yahoo (`.NS` / index tickers).
    """

    def __init__(self, client: NseYahooClient | None = None) -> None:
        self._client = client or NseYahooClient()
        self._symbols = build_nse_symbols()
        self._by_code = {s.symbol_code.upper(): s for s in self._symbols}

    @property
    def exchange_code(self) -> str:
        return EXCHANGE_CODE

    @property
    def market_types(self) -> list[MarketType]:
        return [MarketType.EQUITY, MarketType.FUTURES, MarketType.OPTIONS]

    async def search_symbols(
        self,
        query: str,
        *,
        market_type: MarketType | None = None,
        limit: int = 50,
    ) -> list[Symbol]:
        q = query.upper().strip()
        matched = [
            s
            for s in self._symbols
            if q in s.symbol_code.upper() or q in s.name.upper()
        ]
        if market_type is not None:
            matched = [s for s in matched if s.market_type == market_type]
        return matched[:limit]

    async def get_symbol(self, symbol_code: str) -> Symbol | None:
        return self._by_code.get(symbol_code.upper())

    async def list_symbols(
        self,
        *,
        market_type: MarketType | None = None,
        active_only: bool = True,
    ) -> AsyncIterator[Symbol]:
        for symbol in self._symbols:
            if market_type is not None and symbol.market_type != market_type:
                continue
            if active_only and not symbol.is_active:
                continue
            yield symbol

    async def get_historical_data(
        self,
        symbol_code: str,
        timeframe: Timeframe,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        symbol = await self.ensure_symbol_exists(symbol_code)
        yahoo = yahoo_ticker_for(symbol.symbol_code)
        if yahoo is None:
            raise SymbolNotFoundError(symbol_code, exchange_code=self.exchange_code)

        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)

        interval = self._client.to_interval(timeframe.code)
        # Yahoo intraday history is limited; widen window carefully.
        payload = await self._client.get_chart(
            yahoo,
            interval=interval,
            start=start,
            end=end,
        )
        candles = normalize_yahoo_chart(payload, timeframe, symbol.symbol_code)
        if timeframe.code == "4h":
            candles = _aggregate_to_4h(candles, symbol.symbol_code)
        logger.info(
            "NSE historical bars loaded: {} {} bars={}",
            symbol.symbol_code,
            timeframe.code,
            len(candles),
        )
        return candles

    async def get_live_data(
        self,
        symbol_code: str,
        timeframe: Timeframe,
        limit: int = 1,
    ) -> list[Candle]:
        end = datetime.now(UTC)
        start = end - timedelta(days=5 if timeframe.code in {"1d", "1w"} else 2)
        bars = await self.get_historical_data(symbol_code, timeframe, start, end)
        return bars[-limit:] if limit > 0 else bars

    async def get_market_sessions(self) -> list[MarketSession]:
        return [
            MarketSession(
                session_type="regular",
                open_time=dt_time(9, 15),
                close_time=dt_time(15, 30),
                timezone="Asia/Kolkata",
            )
        ]

    async def get_exchange_info(self) -> ExchangeInfo:
        return ExchangeInfo(
            exchange_code=self.exchange_code,
            name="National Stock Exchange of India",
            market_types=self.market_types,
            supported_timeframes=[parse_timeframe(tf) for tf in SUPPORTED_TIMEFRAMES],
            rate_limit_per_minute=60,
            status="online",
        )

    async def health_check(self) -> AdapterHealth:
        start = time.perf_counter()
        try:
            # Lightweight probe: fetch one daily bar for NIFTY50
            end = datetime.now(UTC)
            start_dt = end - timedelta(days=5)
            await self._client.get_chart(
                "^NSEI",
                interval="1d",
                start=start_dt,
                end=end,
            )
            latency_ms = (time.perf_counter() - start) * 1000
            return AdapterHealth(status="healthy", latency_ms=round(latency_ms, 2))
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            return AdapterHealth(
                status="unhealthy",
                latency_ms=round(latency_ms, 2),
                message=str(exc),
            )

    async def ensure_symbol_exists(self, symbol_code: str) -> Symbol:
        symbol = await self.get_symbol(symbol_code)
        if symbol is None:
            raise SymbolNotFoundError(symbol_code, exchange_code=self.exchange_code)
        return symbol


def _aggregate_to_4h(candles: list[Candle], symbol_code: str) -> list[Candle]:
    """Aggregate 1h Yahoo bars into 4h candles when requested."""
    if not candles:
        return []
    if candles and all(
        (c.close_time - c.open_time).total_seconds() >= 3 * 3600 for c in candles[:3]
    ):
        return candles

    out: list[Candle] = []
    bucket: list[Candle] = []
    for c in candles:
        bucket.append(c)
        if len(bucket) == 4:
            out.append(_merge_bucket(bucket, symbol_code, "4h"))
            bucket = []
    if bucket:
        out.append(_merge_bucket(bucket, symbol_code, "4h"))
    return out


def _merge_bucket(bucket: list[Candle], symbol_code: str, tf: str) -> Candle:
    first, last = bucket[0], bucket[-1]
    return Candle(
        symbol_code=symbol_code,
        timeframe_code=tf,
        open_time=first.open_time,
        close_time=last.close_time,
        open=first.open,
        high=max(c.high for c in bucket),
        low=min(c.low for c in bucket),
        close=last.close,
        volume=sum((c.volume for c in bucket), start=first.volume * 0),
        is_complete=True,
        source="nse",
    )
