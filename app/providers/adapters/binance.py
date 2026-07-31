"""Binance public bridge — default crypto live ticks."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.adapters.binance.client import BinanceClient
from app.providers.base import MarketDataProvider
from app.providers.errors import ProviderUpstreamError
from app.providers.types import (
    InstrumentMetadata,
    NormalizedTick,
    ProviderCapability,
    ProviderHealth,
    ProviderId,
)

_CAPS = frozenset(
    {
        ProviderCapability.TICKS,
        ProviderCapability.STREAMING,
        ProviderCapability.OHLC,
        ProviderCapability.VOLUME,
        ProviderCapability.HISTORICAL,
        ProviderCapability.INSTRUMENTS,
    }
)


class BinanceProvider(MarketDataProvider):
    @property
    def provider_id(self) -> str:
        return ProviderId.BINANCE.value

    @property
    def display_name(self) -> str:
        return "Binance Public"

    @property
    def capabilities(self) -> frozenset[ProviderCapability]:
        return _CAPS

    async def get_tick(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> NormalizedTick:
        client = BinanceClient()
        try:
            raw = await client.get_ticker_price(symbol_code.upper())
        except Exception as exc:  # noqa: BLE001
            raise ProviderUpstreamError(self.provider_id, detail=str(exc)[:200]) from exc
        price = Decimal(str(raw))
        if price <= 0:
            raise ProviderUpstreamError(self.provider_id, detail=f"Invalid price for {symbol_code}")
        return NormalizedTick(
            symbol_code=symbol_code.upper(),
            last=price,
            timestamp=datetime.now(UTC),
            exchange="binance",
            provider=self.provider_id,
            source="binance_ticker",
            market_status="OPEN",
        )

    async def get_instrument(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> InstrumentMetadata | None:
        return InstrumentMetadata(
            symbol_code=symbol_code.upper(),
            name=symbol_code.upper(),
            exchange="binance",
            segment="CRYPTO",
            instrument_type="crypto",
            provider=self.provider_id,
            tradingsymbol=symbol_code.upper(),
        )

    async def health_check(self) -> ProviderHealth:
        try:
            client = BinanceClient()
            await client.ping()
            return ProviderHealth(
                provider=self.provider_id,
                status="ok",
                message="Binance reachable",
                capabilities=tuple(sorted(c.value for c in _CAPS)),
            )
        except Exception as exc:  # noqa: BLE001
            return ProviderHealth(
                provider=self.provider_id,
                status="down",
                message=str(exc)[:200],
                capabilities=tuple(sorted(c.value for c in _CAPS)),
            )
