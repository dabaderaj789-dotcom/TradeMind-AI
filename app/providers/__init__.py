"""Market-data Provider Abstraction Layer.

Architecture
------------
Application (chart tip, option chain, accuracy) → ProviderRegistry → MarketDataProvider
                                                                     ├─ yahoo_nse (default India)
                                                                     ├─ binance   (default crypto)
                                                                     ├─ angel / upstox / dhan
                                                                     └─ zerodha / truedata / gfdl (stubs)

Normalized contracts live in ``types.py``. Adapters never leak broker payloads
upstream. Switch providers with env:

  MARKET_DATA_INDIA_PROVIDER=yahoo_nse|angel|upstox|dhan|zerodha|truedata|global_datafeeds
  MARKET_DATA_CRYPTO_PROVIDER=binance
  MARKET_DATA_OPTION_CHAIN_PROVIDER=yahoo_nse|angel|...
"""

from app.providers.base import MarketDataProvider
from app.providers.registry import ProviderRegistry, get_provider_registry, init_providers
from app.providers.types import (
    InstrumentMetadata,
    NormalizedGreeks,
    NormalizedOHLC,
    NormalizedOptionChain,
    NormalizedOptionLeg,
    NormalizedOptionStrike,
    NormalizedTick,
    ProviderCapability,
    ProviderHealth,
    ProviderId,
)

__all__ = [
    "InstrumentMetadata",
    "MarketDataProvider",
    "NormalizedGreeks",
    "NormalizedOHLC",
    "NormalizedOptionChain",
    "NormalizedOptionLeg",
    "NormalizedOptionStrike",
    "NormalizedTick",
    "ProviderCapability",
    "ProviderHealth",
    "ProviderId",
    "ProviderRegistry",
    "get_provider_registry",
    "init_providers",
]
