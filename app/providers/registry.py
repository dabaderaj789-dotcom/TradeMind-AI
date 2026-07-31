"""Config-driven market-data provider registry.

Application code resolves providers by role (india / crypto / option_chain),
never by hard-coding Angel vs Upstox vs TrueData.
"""

from __future__ import annotations

from app.core.exceptions import NotFoundError
from app.providers.base import MarketDataProvider
from app.providers.types import ProviderCapability, ProviderId


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, MarketDataProvider] = {}
        self._roles: dict[str, str] = {}

    def register(self, provider: MarketDataProvider) -> None:
        self._providers[provider.provider_id] = provider

    def bind_role(self, role: str, provider_id: str) -> None:
        if provider_id not in self._providers:
            raise NotFoundError(
                "Market data provider not registered",
                detail=f"provider={provider_id} role={role}",
            )
        self._roles[role] = provider_id

    def get(self, provider_id: str) -> MarketDataProvider:
        provider = self._providers.get(provider_id)
        if provider is None:
            raise NotFoundError(
                "Market data provider not found",
                detail=f"provider={provider_id}",
            )
        return provider

    def for_role(self, role: str) -> MarketDataProvider:
        provider_id = self._roles.get(role)
        if not provider_id:
            raise NotFoundError(
                "No market data provider bound for role",
                detail=f"role={role}",
            )
        return self.get(provider_id)

    def for_exchange(self, exchange_code: str) -> MarketDataProvider:
        """Map exchange → role → provider (chart/AI never see provider ids)."""
        exch = (exchange_code or "").lower()
        if exch == "binance":
            return self.for_role("crypto")
        if exch in {"nse", "bse"}:
            return self.for_role("india")
        if exch == "forex":
            # Forex still uses yahoo bridge until a dedicated provider exists.
            return self.for_role("india") if "india" in self._roles else self.get(ProviderId.YAHOO_NSE.value)
        return self.for_role("india")

    def list_providers(self) -> list[MarketDataProvider]:
        return list(self._providers.values())

    def role_map(self) -> dict[str, str]:
        return dict(self._roles)

    def describe(self) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        reverse: dict[str, list[str]] = {}
        for role, pid in self._roles.items():
            reverse.setdefault(pid, []).append(role)
        for p in self._providers.values():
            rows.append(
                {
                    "provider_id": p.provider_id,
                    "display_name": p.display_name,
                    "configured": p.is_configured,
                    "capabilities": sorted(c.value for c in p.capabilities),
                    "roles": reverse.get(p.provider_id, []),
                    "supports_option_chain": p.supports(ProviderCapability.OPTION_CHAIN),
                    "supports_streaming": p.supports(ProviderCapability.STREAMING),
                }
            )
        return rows


_registry: ProviderRegistry | None = None


def init_providers() -> ProviderRegistry:
    """Build registry from settings and register all known adapters."""
    global _registry
    from app.config.settings import get_settings
    from app.providers.adapters import (
        AngelSmartApiProvider,
        BinanceProvider,
        DhanHqProvider,
        GlobalDatafeedsProvider,
        TrueDataProvider,
        UpstoxProvider,
        YahooNseProvider,
        ZerodhaProvider,
    )

    settings = get_settings()
    registry = ProviderRegistry()

    registry.register(YahooNseProvider())
    registry.register(BinanceProvider())
    registry.register(
        AngelSmartApiProvider(
            api_key=settings.angel_api_key,
            client_code=settings.angel_client_code,
            api_secret=settings.angel_api_secret,
            password=settings.angel_password,
            totp_secret=settings.angel_totp_secret,
        )
    )
    registry.register(
        UpstoxProvider(
            access_token=settings.upstox_access_token,
            api_key=settings.upstox_api_key,
        )
    )
    registry.register(
        DhanHqProvider(
            access_token=settings.dhan_access_token,
            client_id=settings.dhan_client_id,
        )
    )
    registry.register(
        ZerodhaProvider(
            api_key=settings.kite_api_key,
            access_token=settings.kite_access_token,
        )
    )
    registry.register(
        TrueDataProvider(
            username=settings.truedata_username,
            password=settings.truedata_password,
        )
    )
    registry.register(
        GlobalDatafeedsProvider(api_key=settings.gfdl_api_key)
    )

    registry.bind_role("india", settings.market_data_india_provider)
    registry.bind_role("crypto", settings.market_data_crypto_provider)
    registry.bind_role("option_chain", settings.market_data_option_chain_provider)

    _registry = registry
    return registry


def get_provider_registry() -> ProviderRegistry:
    if _registry is None:
        return init_providers()
    return _registry
