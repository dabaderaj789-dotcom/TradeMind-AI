"""Pullback strategy."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.engines.strategy.base import BaseStrategy
from app.engines.strategy.types import SetupEvaluation, SetupInput, TradePlan, new_plan_id
from app.engines.strategy.utils import (
    compute_rr,
    entry_mid,
    evidence_score,
    has_reference,
    stop_price,
    targets_from_setup,
)


class PullbackParameters(BaseModel):
    min_setup_confidence: float = Field(default=50.0, ge=0, le=100)
    min_strategy_confidence: float = Field(default=55.0, ge=0, le=100)
    position_risk_pct: float = Field(default=1.0, ge=0.1, le=10.0)
    trade_expiration_bars: int = Field(default=25, ge=1, le=200)
    min_risk_reward: float = Field(default=1.2, ge=0.5, le=20.0)


class PullbackStrategy(BaseStrategy):
    @classmethod
    def strategy_id(cls) -> str:
        return "pullback"

    @classmethod
    def strategy_name(cls) -> str:
        return "Pullback"

    @classmethod
    def description(cls) -> str:
        return "Trades pullback setups with market structure and mitigated order block confirmation"

    @classmethod
    def required_setup_types(cls) -> list[str]:
        return ["pullback"]

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return PullbackParameters().model_dump()

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return PullbackParameters

    def evaluate_setup(self, setup: SetupInput, parameters: dict[str, Any]) -> SetupEvaluation:
        if setup.confidence_score < parameters["min_setup_confidence"]:
            return SetupEvaluation(False, 0.0, "Setup confidence below threshold")

        direction = setup.direction
        ms_conf = evidence_score(setup, "market_structure_confidence")
        mitigated = evidence_score(setup, f"mitigated_order_block_{direction}")
        filled_fvg = evidence_score(setup, f"filled_fvg_{direction}")

        if ms_conf < 30:
            return SetupEvaluation(False, 0.0, "Insufficient market structure confidence")
        if mitigated < 20 and not has_reference(setup, "order_block_id"):
            return SetupEvaluation(False, 0.0, "Missing order block mitigation evidence")

        strategy_conf = min((ms_conf + max(mitigated, filled_fvg)) / 1.5, 100.0)
        used = {"market_structure": ms_conf, "mitigated_ob": mitigated, "filled_fvg": filled_fvg}

        if strategy_conf < parameters["min_strategy_confidence"]:
            return SetupEvaluation(False, strategy_conf, "Strategy confidence below threshold", used)

        return SetupEvaluation(
            True, strategy_conf,
            f"Pullback {direction} into mitigated institutional zone",
            used,
        )

    def generate_trade_plan(
        self,
        setup: SetupInput,
        evaluation: SetupEvaluation,
        parameters: dict[str, Any],
    ) -> TradePlan | None:
        entry = entry_mid(setup)
        stop = stop_price(setup, setup.direction)
        t1, t2, t3 = targets_from_setup(setup)
        rr = compute_rr(entry, stop, t1)
        if rr < parameters["min_risk_reward"]:
            return None

        return TradePlan(
            plan_id=new_plan_id(),
            strategy_id=self.strategy_id(),
            strategy_version=self.strategy_version(),
            setup_id=setup.setup_id,
            direction=setup.direction,
            entry_zone_high=float(setup.entry_zone["high"]),
            entry_zone_low=float(setup.entry_zone["low"]),
            stop_loss=stop,
            target_1=t1,
            target_2=t2,
            target_3=t3,
            risk_reward=rr,
            trade_expiration_bars=parameters["trade_expiration_bars"],
            position_risk_pct=parameters["position_risk_pct"],
            strategy_confidence=evaluation.strategy_confidence,
            reasoning=evaluation.reasoning,
            detected_at=setup.detected_at,
        )
