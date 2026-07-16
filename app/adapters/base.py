"""Abstract exchange adapter interface."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from datetime import datetime

from app.core.exceptions import StreamingNotSupportedError
from app.domain.entities.adapter_types import AdapterHealth, ExchangeInfo, MarketSession, Tick
from app.domain.entities.candle import Candle
from app.domain.entities.symbol import Symbol
from app.domain.enums.market_type import MarketType
from app.domain.value_objects.timeframe import Timeframe


class ExchangeAdapter(ABC):
    """Unified interface for all market data sources."""

    @property
    @abstractmethod
    def exchange_code(self) -> str:
        """Unique code: 'nse', 'binance', 'bybit'."""

    @property
    @abstractmethod
    def market_types(self) -> list[MarketType]:
        """Supported market types."""

    @abstractmethod
    async def search_symbols(
        self,
        query: str,
        *,
        market_type: MarketType | None = None,
        limit: int = 50,
    ) -> list[Symbol]:
        ...

    @abstractmethod
    async def get_symbol(self, symbol_code: str) -> Symbol | None:
        ...

    @abstractmethod
    async def list_symbols(
        self,
        *,
        market_type: MarketType | None = None,
        active_only: bool = True,
    ) -> AsyncIterator[Symbol]:
        ...

    @abstractmethod
    async def get_historical_data(
        self,
        symbol_code: str,
        timeframe: Timeframe,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        ...

    @abstractmethod
    async def get_live_data(
        self,
        symbol_code: str,
        timeframe: Timeframe,
        limit: int = 1,
    ) -> list[Candle]:
        ...

    async def subscribe_ticks(self, symbol_codes: list[str]) -> AsyncIterator[Tick]:
        """WebSocket tick stream — override when streaming is implemented."""
        raise StreamingNotSupportedError(self.exchange_code)
        yield  # pragma: no cover — makes this an async generator for type checkers

    async def subscribe_candles(
        self,
        symbol_code: str,
        timeframe: Timeframe,
    ) -> AsyncIterator[Candle]:
        """WebSocket candle stream — override when streaming is implemented."""
        raise StreamingNotSupportedError(self.exchange_code)
        yield  # pragma: no cover

    @abstractmethod
    async def get_market_sessions(self) -> list[MarketSession]:
        ...

    @abstractmethod
    async def get_exchange_info(self) -> ExchangeInfo:
        ...

    @abstractmethod
    async def health_check(self) -> AdapterHealth:
        ...
