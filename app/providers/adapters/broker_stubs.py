"""Broker / vendor adapters that are not yet credentialed.

Each class implements the full MarketDataProvider surface. Methods raise
ProviderNotConfiguredError until settings credentials are present.
When you add real HTTP/WS clients, keep return types as Normalized* only.
"""

from __future__ import annotations

from datetime import datetime

from app.providers._helpers import empty_health, require_configured
from app.providers.base import MarketDataProvider
from app.providers.types import (
    InstrumentMetadata,
    NormalizedOHLC,
    NormalizedOptionChain,
    NormalizedTick,
    ProviderCapability,
    ProviderHealth,
    ProviderId,
)

_BROKER_CAPS = frozenset(
    {
        ProviderCapability.TICKS,
        ProviderCapability.STREAMING,
        ProviderCapability.OHLC,
        ProviderCapability.VOLUME,
        ProviderCapability.OPTION_CHAIN,
        ProviderCapability.OI,
        ProviderCapability.GREEKS,
        ProviderCapability.INSTRUMENTS,
        ProviderCapability.HISTORICAL,
    }
)

_VENDOR_CAPS = frozenset(
    {
        ProviderCapability.TICKS,
        ProviderCapability.STREAMING,
        ProviderCapability.OHLC,
        ProviderCapability.VOLUME,
        ProviderCapability.OPTION_CHAIN,
        ProviderCapability.OI,
        ProviderCapability.GREEKS,
        ProviderCapability.INSTRUMENTS,
        ProviderCapability.HISTORICAL,
    }
)


class _CredentialedStub(MarketDataProvider):
    """Shared stub behaviour for not-yet-wired providers."""

    _id: str
    _name: str
    _caps: frozenset[ProviderCapability] = _BROKER_CAPS

    def __init__(self, *, api_key: str | None = None, api_secret: str | None = None, **_: object) -> None:
        self._api_key = (api_key or "").strip()
        self._api_secret = (api_secret or "").strip()

    @property
    def provider_id(self) -> str:
        return self._id

    @property
    def display_name(self) -> str:
        return self._name

    @property
    def capabilities(self) -> frozenset[ProviderCapability]:
        return self._caps

    @property
    def is_configured(self) -> bool:
        # Subclasses may override (e.g. Angel needs clientcode + pin + api_key).
        return bool(self._api_key)

    async def get_tick(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> NormalizedTick:
        require_configured(self)
        raise NotImplementedError(f"{self.provider_id}: live client not implemented yet")

    async def get_ohlc(
        self,
        symbol_code: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        *,
        exchange: str | None = None,
    ) -> list[NormalizedOHLC]:
        require_configured(self)
        raise NotImplementedError(f"{self.provider_id}: OHLC client not implemented yet")

    async def get_option_chain(
        self,
        underlying: str,
        *,
        expiry: str | None = None,
    ) -> NormalizedOptionChain:
        require_configured(self)
        raise NotImplementedError(f"{self.provider_id}: option chain client not implemented yet")

    async def get_instrument(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> InstrumentMetadata | None:
        require_configured(self)
        return None

    async def health_check(self) -> ProviderHealth:
        return empty_health(
            self.provider_id,
            configured=self.is_configured,
            capabilities=self._caps,
            message=(
                f"{self.display_name} adapter registered. "
                "Wire REST/WS client when credentials are available."
            ),
        )


class UpstoxProvider(_CredentialedStub):
    """Upstox Developer API — set UPSTOX_ACCESS_TOKEN (or OAuth flow)."""

    _id = ProviderId.UPSTOX.value
    _name = "Upstox API"

    def __init__(self, *, access_token: str | None = None, api_key: str | None = None, **kwargs: object) -> None:
        super().__init__(api_key=api_key or access_token, **kwargs)
        self._access_token = (access_token or api_key or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._access_token)


class DhanHqProvider(_CredentialedStub):
    """DhanHQ — set DHAN_ACCESS_TOKEN + DHAN_CLIENT_ID (Data API subscription for live)."""

    _id = ProviderId.DHAN.value
    _name = "DhanHQ"

    def __init__(
        self,
        *,
        access_token: str | None = None,
        client_id: str | None = None,
        api_key: str | None = None,
        **kwargs: object,
    ) -> None:
        super().__init__(api_key=api_key or access_token, **kwargs)
        self._access_token = (access_token or "").strip()
        self._client_id = (client_id or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._access_token and self._client_id)


class ZerodhaProvider(_CredentialedStub):
    """Zerodha Kite Connect (future) — set KITE_API_KEY + KITE_ACCESS_TOKEN."""

    _id = ProviderId.ZERODHA.value
    _name = "Zerodha Kite Connect"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        access_token: str | None = None,
        **kwargs: object,
    ) -> None:
        super().__init__(api_key=api_key, **kwargs)
        self._access_token = (access_token or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._access_token)


class TrueDataProvider(_CredentialedStub):
    """TrueData authorised vendor (future) — set TRUEDATA_USERNAME + TRUEDATA_PASSWORD."""

    _id = ProviderId.TRUEDATA.value
    _name = "TrueData"
    _caps = _VENDOR_CAPS

    def __init__(
        self,
        *,
        username: str | None = None,
        password: str | None = None,
        api_key: str | None = None,
        **kwargs: object,
    ) -> None:
        super().__init__(api_key=api_key or username, api_secret=password, **kwargs)
        self._username = (username or "").strip()
        self._password = (password or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._username and self._password)


class GlobalDatafeedsProvider(_CredentialedStub):
    """Global Datafeeds (future) — set GFDL_API_KEY (and endpoint if required)."""

    _id = ProviderId.GLOBAL_DATAFEEDS.value
    _name = "Global Datafeeds"
    _caps = _VENDOR_CAPS

    def __init__(self, *, api_key: str | None = None, **kwargs: object) -> None:
        super().__init__(api_key=api_key, **kwargs)
