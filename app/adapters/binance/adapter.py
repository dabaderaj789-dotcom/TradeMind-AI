"""Binance Spot exchange adapter."""

import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, time as dt_time

from loguru import logger

from app.adapters.base import ExchangeAdapter
from app.adapters.binance.client import BinanceClient
from app.adapters.binance.constants import EXCHANGE_CODE, SUPPORTED_TIMEFRAMES
from app.adapters.binance.normalizer import normalize_kline, normalize_symbol, to_binance_interval
from app.core.exceptions import SymbolNotFoundError
from app.domain.entities.adapter_types import AdapterHealth, ExchangeInfo, MarketSession
from app.domain.entities.candle import Candle
from app.domain.entities.symbol import Symbol
from app.domain.enums.market_type import MarketType
from app.domain.value_objects.timeframe import Timeframe, parse_timeframe


class BinanceAdapter(ExchangeAdapter):
    """Binance Spot market data adapter."""

    def __init__(self, client: BinanceClient | None = None) -> None:
        self._client = client or BinanceClient()
        self._symbols_cache: list[Symbol] | None = None

    @property
    def exchange_code(self) -> str:
        return EXCHANGE_CODE

    @property
    def market_types(self) -> list[MarketType]:
        return [MarketType.CRYPTO]

    async def _load_symbols(self) -> list[Symbol]:
        if self._symbols_cache is not None:
            return self._symbols_cache

        data = await self._client.get_exchange_info()
        symbols: list[Symbol] = []
        for raw in data.get("symbols", []):
            symbol = normalize_symbol(raw)
            if symbol is not None:
                symbols.append(symbol)

        self._symbols_cache = symbols
        logger.info("Loaded {} Binance USDT spot symbols", len(symbols))
        return symbols

    async def search_symbols(
        self,
        query: str,
        *,
        market_type: MarketType | None = None,
        limit: int = 50,
    ) -> list[Symbol]:
        symbols = await self._load_symbols()
        query_upper = query.upper()
        matched = [
            s
            for s in symbols
            if query_upper in s.symbol_code.upper() or query_upper in s.name.upper()
        ]
        if market_type is not None:
            matched = [s for s in matched if s.market_type == market_type]
        return matched[:limit]

    async def get_symbol(self, symbol_code: str) -> Symbol | None:
        symbols = await self._load_symbols()
        code = symbol_code.upper()
        for symbol in symbols:
            if symbol.symbol_code.upper() == code:
                return symbol
        return None

    async def list_symbols(
        self,
        *,
        market_type: MarketType | None = None,
        active_only: bool = True,
    ) -> AsyncIterator[Symbol]:
        symbols = await self._load_symbols()
        for symbol in symbols:
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
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)

        interval = to_binance_interval(timeframe.code)
        all_candles: list[Candle] = []
        current_start = start
        from datetime import timedelta

        while current_start < end:
            raw_klines = await self._client.get_klines(
                symbol=symbol_code,
                interval=interval,
                start_time=current_start,
                end_time=end,
            )
            if not raw_klines:
                break

            batch = [
                normalize_kline(kline, symbol_code.upper(), timeframe.code) for kline in raw_klines
            ]
            all_candles.extend(batch)

            if len(raw_klines) < 1000:
                break

            next_start = batch[-1].open_time + timedelta(seconds=timeframe.seconds)
            if next_start <= current_start:
                break
            current_start = next_start

        return all_candles

    async def get_live_data(
        self,
        symbol_code: str,
        timeframe: Timeframe,
        limit: int = 1,
    ) -> list[Candle]:
        interval = to_binance_interval(timeframe.code)
        raw_klines = await self._client.get_klines(
            symbol=symbol_code,
            interval=interval,
            limit=limit,
        )
        return [normalize_kline(k, symbol_code.upper(), timeframe.code) for k in raw_klines]

    async def get_market_sessions(self) -> list[MarketSession]:
        return [
            MarketSession(
                session_type="regular",
                open_time=dt_time(0, 0),
                close_time=dt_time(23, 59, 59),
                timezone="UTC",
            )
        ]

    async def get_exchange_info(self) -> ExchangeInfo:
        return ExchangeInfo(
            exchange_code=self.exchange_code,
            name="Binance Spot",
            market_types=self.market_types,
            supported_timeframes=[parse_timeframe(tf) for tf in SUPPORTED_TIMEFRAMES],
            rate_limit_per_minute=1200,
            status="online",
        )

    async def health_check(self) -> AdapterHealth:
        start = time.perf_counter()
        try:
            await self._client.ping()
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
