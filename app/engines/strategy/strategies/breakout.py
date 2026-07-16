"""Breakout strategy."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.engines.strategy.base import BaseStrategy
from app.engines.strategy.types import SetupEvaluation, SetupInput, TradePlan, new_plan_id
from app.engines.strategy.utils import (
    compute_rr,
    entry_mid,
    evidence_score,
    stop_price,
    targets_from_setup,
)


class BreakoutParameters(BaseModel):
    min_setup_confidence: float = Field(default=55.0, ge=0, le=100)
    min_strategy_confidence: float = Field(default=65.0, ge=0, le=100)
    position_risk_pct: float = Field(default=1.0, ge=0.1, le=10.0)
    trade_expiration_bars: int = Field(default=15, ge=1, le=200)
    min_risk_reward: float = Field(default=1.5, ge=0.5, le=20.0)


class BreakoutStrategy(BaseStrategy):
    @classmethod
    def strategy_id(cls) -> str:
        return "breakout"

    @classmethod
    def strategy_name(cls) -> str:
        return "Breakout"

    @classmethod
    def description(cls) -> str:
        return "Trades breakout setups with BOS and volume confirmation"

    @classmethod
    def required_setup_types(cls) -> list[str]:
        return ["breakout"]

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return BreakoutParameters().model_dump()

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return BreakoutParameters

    def evaluate_setup(self, setup: SetupInput, parameters: dict[str, Any]) -> SetupEvaluation:
        if setup.confidence_score < parameters["min_setup_confidence"]:
            return SetupEvaluation(False, 0.0, "Setup confidence below threshold")

        direction = setup.direction
        bos = evidence_score(
            setup,
            "bullish_bos" if direction == "bullish" else "bearish_bos",
        )
        volume = evidence_score(setup, "volume_confirmation")

        if bos < 50:
            return SetupEvaluation(False, 0.0, "Missing BOS confirmation")
        if volume < 25:
            return SetupEvaluation(False, 0.0, "Insufficient volume confirmation")

        strategy_conf = min((bos + volume) / 1.8, 100.0)
        used = {"bos": bos, "volume": volume}

        if strategy_conf < parameters["min_strategy_confidence"]:
            return SetupEvaluation(False, strategy_conf, "Strategy confidence below threshold", used)

        return SetupEvaluation(
            True, strategy_conf,
            f"Breakout {direction} with BOS and volume confirmation",
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
