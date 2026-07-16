"""Exchange adapter interface and registry."""

from app.adapters.base import ExchangeAdapter
from app.adapters.registry import AdapterRegistry, get_adapter_registry, init_adapters

__all__ = ["AdapterRegistry", "ExchangeAdapter", "get_adapter_registry", "init_adapters"]
