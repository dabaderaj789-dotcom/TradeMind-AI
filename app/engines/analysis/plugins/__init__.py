"""Built-in analysis plugin registration."""

from app.engines.analysis.plugins.atr import ATRPlugin
from app.engines.analysis.plugins.bollinger_bands import BollingerBandsPlugin
from app.engines.analysis.plugins.ema import EMAPlugin
from app.engines.analysis.plugins.macd import MACDPlugin
from app.engines.analysis.plugins.fair_value_gaps.plugin import FairValueGapPlugin
from app.engines.analysis.plugins.liquidity_sweeps.plugin import LiquiditySweepPlugin
from app.engines.analysis.plugins.market_structure.plugin import MarketStructurePlugin
from app.engines.analysis.plugins.order_blocks.plugin import OrderBlockPlugin
from app.engines.analysis.plugins.obv import OBVPlugin
from app.engines.analysis.plugins.rsi import RSIPlugin
from app.engines.analysis.plugins.sma import SMAPlugin
from app.engines.analysis.plugins.vwap import VWAPPlugin
from app.engines.analysis.registry import AnalysisPluginRegistry

_BUILTIN_PLUGINS = [
    EMAPlugin,
    SMAPlugin,
    RSIPlugin,
    MACDPlugin,
    ATRPlugin,
    BollingerBandsPlugin,
    VWAPPlugin,
    OBVPlugin,
    MarketStructurePlugin,
    OrderBlockPlugin,
    FairValueGapPlugin,
    LiquiditySweepPlugin,
]


def register_builtin_plugins(registry: AnalysisPluginRegistry) -> None:
    """Register all Phase 1 built-in analysis plugins."""
    for plugin_cls in _BUILTIN_PLUGINS:
        registry.register(plugin_cls())
