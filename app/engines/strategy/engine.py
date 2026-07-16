"""Strategy engine orchestrator."""

from __future__ import annotations

from app.engines.analysis.utils import hash_parameters
from app.engines.strategy.base import BaseStrategy
from app.engines.strategy.types import SetupEvaluation, SetupInput, TradePlan


class StrategyEngine:
    """Evaluates trade setups and generates trade plans."""

    def evaluate(
        self,
        strategy: BaseStrategy,
        setup: SetupInput,
        parameters: dict | None = None,
    ) -> tuple[SetupEvaluation, TradePlan | None]:
        params = strategy.validate(parameters)
        evaluation = strategy.evaluate_setup(setup, params)
        plan = None
        if evaluation.accepted:
            plan = strategy.generate_trade_plan(setup, evaluation, params)
            if plan is not None:
                plan.params_hash = hash_parameters(params)
        return evaluation, plan

    def evaluate_batch(
        self,
        strategy: BaseStrategy,
        setups: list[SetupInput],
        parameters: dict | None = None,
    ) -> list[tuple[SetupInput, SetupEvaluation, TradePlan | None]]:
        results: list[tuple[SetupInput, SetupEvaluation, TradePlan | None]] = []
        for setup in setups:
            if setup.setup_type not in strategy.required_setup_types():
                continue
            if setup.status not in ("active",):
                continue
            evaluation, plan = self.evaluate(strategy, setup, parameters)
            results.append((setup, evaluation, plan))
        return results
