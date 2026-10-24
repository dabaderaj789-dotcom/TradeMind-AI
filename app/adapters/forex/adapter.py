"""Forex / metals market data adapter (spot gold)."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, time as dt_time, timedelta
from decimal import Decimal

import httpx
from loguru import logger

from app.adapters.base import ExchangeAdapter
from app.adapters.forex.constants import EXCHANGE_CODE, INTERVAL_MAP
from app.adapters.forex.symbols import build_forex_symbols
from app.core.exceptions import SymbolNotFoundError
from app.domain.entities.adapter_types import AdapterHealth, ExchangeInfo, MarketSession
from app.domain.entities.candle import Candle
from app.domain.entities.symbol import Symbol
from app.domain.enums.market_type import MarketType
from app.domain.value_objects.timeframe import Timeframe, parse_timeframe

SUPPORTED_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]


class ForexAdapter(ExchangeAdapter):
    """Gold spot via Pax Gold (PAXGUSDT), which tracks the XAUUSD spot print."""

    def __init__(self) -> None:
        self._symbols = build_forex_symbols()
        self._by_code = {s.symbol_code.upper(): s for s in self._symbols}

    @property
    def exchange_code(self) -> str:
        return EXCHANGE_CODE

    @property
    def market_types(self) -> list[MarketType]:
        return [MarketType.COMMODITY, MarketType.FOREX]

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

        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)

        interval = INTERVAL_MAP.get(timeframe.code, "15m")
        raw = await _spot_klines(interval, start, end)
        now = datetime.now(UTC)
        candles = [_spot_candle(row, symbol.symbol_code, timeframe.code, now) for row in raw]
        logger.info(
            "Forex historical bars loaded: {} {} bars={}",
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
        # Metals / FX trade nearly 24h Sun–Fri
        return [
            MarketSession(
                session_type="regular",
                open_time=dt_time(0, 0),
                close_time=dt_time(23, 59),
                timezone="UTC",
            )
        ]

    async def get_exchange_info(self) -> ExchangeInfo:
        return ExchangeInfo(
            exchange_code=self.exchange_code,
            name="Gold Spot (XAUUSD)",
            market_types=self.market_types,
            supported_timeframes=[parse_timeframe(tf) for tf in SUPPORTED_TIMEFRAMES],
            rate_limit_per_minute=60,
            status="online",
        )

    async def health_check(self) -> AdapterHealth:
        start = time.perf_counter()
        try:
            end = datetime.now(UTC)
            await self.get_historical_data(
                "XAUUSD",
                parse_timeframe("1d"),
                end - timedelta(days=5),
                end,
            )
            return AdapterHealth(
                status="healthy",
                latency_ms=round((time.perf_counter() - start) * 1000, 2),
                message="ok",
            )
        except Exception as exc:  # noqa: BLE001
            return AdapterHealth(
                status="unhealthy",
                latency_ms=round((time.perf_counter() - start) * 1000, 2),
                message=str(exc),
            )

    async def ensure_symbol_exists(self, symbol_code: str) -> Symbol:
        symbol = await self.get_symbol(symbol_code)
        if symbol is None:
            raise SymbolNotFoundError(symbol_code, exchange_code=self.exchange_code)
        return symbol


_SPOT = "https://api.binance.com"
# PAXG is allocated gold. Its print sits with FOREX.com Gold Spot.
# The XAUUSDT index runs about $10 above that chart.
_SYMBOL = "PAXGUSDT"


async def _spot_klines(interval: str, start: datetime, end: datetime) -> list[list]:
    cursor = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)
    out: list[list] = []
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        while cursor < end_ms:
            response = await client.get(
                f"{_SPOT}/api/v3/klines",
                params={
                    "symbol": _SYMBOL,
                    "interval": interval,
                    "startTime": cursor,
                    "endTime": end_ms,
                    "limit": 1000,
                },
            )
            response.raise_for_status()
            batch = response.json()
            if not isinstance(batch, list) or not batch:
                break
            out.extend(batch)
            nxt = int(batch[-1][0]) + 1
            if nxt <= cursor or len(batch) < 1000:
                break
            cursor = nxt
    return out


def _spot_candle(row: list, symbol_code: str, timeframe_code: str, now: datetime) -> Candle:
    open_time = datetime.fromtimestamp(int(row[0]) / 1000, tz=UTC)
    close_time = datetime.fromtimestamp(int(row[6]) / 1000, tz=UTC)
    return Candle(
        symbol_code=symbol_code,
        timeframe_code=timeframe_code,
        open_time=open_time,
        close_time=close_time,
        open=Decimal(str(row[1])),
        high=Decimal(str(row[2])),
        low=Decimal(str(row[3])),
        close=Decimal(str(row[4])),
        volume=Decimal(str(row[5])),
        is_complete=close_time <= now,
        source="forex",
    )
