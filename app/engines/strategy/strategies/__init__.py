"""Built-in strategy registration."""

from app.engines.strategy.registry import StrategyRegistry
from app.engines.strategy.strategies.breakout import BreakoutStrategy
from app.engines.strategy.strategies.pullback import PullbackStrategy
from app.engines.strategy.strategies.range_rejection import RangeRejectionStrategy
from app.engines.strategy.strategies.reversal import ReversalStrategy
from app.engines.strategy.strategies.trend_continuation import TrendContinuationStrategy

_BUILTIN = [
    TrendContinuationStrategy,
    PullbackStrategy,
    BreakoutStrategy,
    ReversalStrategy,
    RangeRejectionStrategy,
]


def register_builtin_strategies(registry: StrategyRegistry) -> None:
    for cls in _BUILTIN:
        registry.register(cls())
