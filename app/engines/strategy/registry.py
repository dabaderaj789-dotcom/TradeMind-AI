"""Strategy registry."""

from __future__ import annotations

from app.engines.strategy.base import BaseStrategy

_registry: dict[str, BaseStrategy] = {}


class StrategyRegistry:
    def register(self, strategy: BaseStrategy) -> None:
        _registry[strategy.strategy_id()] = strategy

    def get(self, strategy_id: str) -> BaseStrategy:
        if strategy_id not in _registry:
            raise KeyError(f"Strategy not registered: {strategy_id}")
        return _registry[strategy_id]

    def list_all(self) -> list[BaseStrategy]:
        return list(_registry.values())

    def list_metadata(self) -> list[dict]:
        return [s.metadata() for s in _registry.values()]


def get_strategy_registry() -> StrategyRegistry:
    return StrategyRegistry()


def init_strategies() -> None:
    from app.engines.strategy.strategies import register_builtin_strategies

    register_builtin_strategies(get_strategy_registry())
