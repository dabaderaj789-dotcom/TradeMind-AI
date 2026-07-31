"""Common market-data provider interface.

Application services (MarketEngine, QuoteService, option chain UI) depend
only on this ABC. Switching Angel → Upstox → TrueData is a registry/config
change — not a change to chart or AI code.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from datetime import datetime

from app.core.exceptions import StreamingNotSupportedError
from app.providers.types import (
    InstrumentMetadata,
    NormalizedOHLC,
    NormalizedOptionChain,
    NormalizedTick,
    ProviderCapability,
    ProviderHealth,
)


class MarketDataProvider(ABC):
    """One adapter per upstream (broker API or authorised data vendor)."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Stable id matching ProviderId / settings."""

    @property
    @abstractmethod
    def display_name(self) -> str: ...

    @property
    @abstractmethod
    def capabilities(self) -> frozenset[ProviderCapability]: ...

    def supports(self, capability: ProviderCapability) -> bool:
        return capability in self.capabilities

    @property
    def is_configured(self) -> bool:
        """False until credentials / license keys are present."""
        return True

    @abstractmethod
    async def get_tick(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> NormalizedTick:
        """Last price (and optional volume / bid / ask / OI)."""

    async def get_ohlc(
        self,
        symbol_code: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        *,
        exchange: str | None = None,
    ) -> list[NormalizedOHLC]:
        raise NotImplementedError(f"{self.provider_id} does not implement get_ohlc")

    async def get_option_chain(
        self,
        underlying: str,
        *,
        expiry: str | None = None,
    ) -> NormalizedOptionChain:
        raise NotImplementedError(f"{self.provider_id} does not implement get_option_chain")

    async def get_instrument(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> InstrumentMetadata | None:
        return None

    async def list_instruments(
        self,
        *,
        exchange: str | None = None,
        segment: str | None = None,
    ) -> list[InstrumentMetadata]:
        return []

    async def stream_ticks(
        self,
        symbol_codes: list[str],
        *,
        exchange: str | None = None,
    ) -> AsyncIterator[NormalizedTick]:
        raise StreamingNotSupportedError(self.provider_id)
        yield  # pragma: no cover

    @abstractmethod
    async def health_check(self) -> ProviderHealth: ...
