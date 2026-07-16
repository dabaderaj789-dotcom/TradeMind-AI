"""Adapter registry for resolving exchange implementations."""

from app.adapters.base import ExchangeAdapter
from app.core.exceptions import NotFoundError


class AdapterRegistry:
    """Resolves adapter instances by exchange code."""

    def __init__(self) -> None:
        self._adapters: dict[str, ExchangeAdapter] = {}

    def register(self, adapter: ExchangeAdapter) -> None:
        self._adapters[adapter.exchange_code] = adapter

    def get(self, exchange_code: str) -> ExchangeAdapter:
        adapter = self._adapters.get(exchange_code.lower())
        if adapter is None:
            raise NotFoundError(
                "Exchange adapter not found",
                detail=f"exchange={exchange_code}",
            )
        return adapter

    def list_exchanges(self) -> list[str]:
        return sorted(self._adapters.keys())

    def all_adapters(self) -> list[ExchangeAdapter]:
        return list(self._adapters.values())


_registry: AdapterRegistry | None = None


def init_adapters() -> AdapterRegistry:
    """Initialize and populate the global adapter registry."""
    global _registry
    from app.adapters.binance.adapter import BinanceAdapter
    from app.adapters.nse.adapter import NseAdapter

    registry = AdapterRegistry()
    registry.register(BinanceAdapter())
    registry.register(NseAdapter())
    _registry = registry
    return registry


def get_adapter_registry() -> AdapterRegistry:
    if _registry is None:
        return init_adapters()
    return _registry
