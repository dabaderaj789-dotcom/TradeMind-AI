"""Unit tests for Strategy Engine."""

import pytest

from datetime import UTC, datetime

from app.engines.strategy.engine import StrategyEngine
from app.engines.strategy.registry import get_strategy_registry, init_strategies
from app.engines.strategy.strategies.trend_continuation import TrendContinuationStrategy
from app.engines.strategy.types import SetupInput


def _setup(
    setup_type: str = "trend_continuation",
    direction: str = "bullish",
    confidence: float = 70.0,
    evidence: dict | None = None,
) -> SetupInput:
    return SetupInput(
        setup_id="setup-1",
        setup_type=setup_type,
        direction=direction,
        confidence_score=confidence,
        confidence_level="high",
        evidence_scores=evidence or {
            "trend_alignment_bullish": 85.0,
            "fresh_order_block_bullish": 70.0,
            "open_fvg_bullish": 60.0,
        },
        entry_zone={"high": 105.0, "low": 104.0},
        stop_loss_zone={"high": 104.0, "low": 102.0},
        target_zones=[
            {"high": 111.0, "low": 110.5, "label": "target_1"},
            {"high": 115.0, "low": 114.5, "label": "target_2"},
        ],
        risk_reward=2.0,
        explanation="Test setup",
        reference_ids={},
        detected_at=datetime(2024, 1, 1, tzinfo=UTC),
        status="active",
    )


def test_registry_has_five_strategies() -> None:
    init_strategies()
    registry = get_strategy_registry()
    assert len(registry.list_all()) == 5


def test_trend_continuation_accepts_valid_setup() -> None:
    strategy = TrendContinuationStrategy()
    engine = StrategyEngine()
    evaluation, plan = engine.evaluate(strategy, _setup(), {"min_strategy_confidence": 50.0})
    assert evaluation.accepted
    assert plan is not None
    assert plan.direction == "bullish"
    assert plan.risk_reward > 0
    assert plan.target_1 > plan.entry_zone_low


def test_trend_continuation_rejects_low_confidence() -> None:
    strategy = TrendContinuationStrategy()
    engine = StrategyEngine()
    evaluation, plan = engine.evaluate(
        strategy,
        _setup(confidence=30.0, evidence={"trend_alignment_bullish": 20.0}),
        {},
    )
    assert not evaluation.accepted
    assert plan is None


def test_wrong_setup_type_skipped_in_batch() -> None:
    init_strategies()
    strategy = TrendContinuationStrategy()
    engine = StrategyEngine()
    batch = engine.evaluate_batch(
        strategy,
        [_setup(setup_type="breakout")],
    )
    assert len(batch) == 0


def test_trade_plan_has_required_fields() -> None:
    strategy = TrendContinuationStrategy()
    _, plan = StrategyEngine().evaluate(strategy, _setup(), {"min_strategy_confidence": 40.0})
    assert plan is not None
    assert plan.plan_id
    assert plan.strategy_id == "trend_continuation"
    assert plan.reasoning
    assert plan.trade_expiration_bars > 0


@pytest.mark.parametrize(
    ("strategy_id", "setup_type", "evidence", "extra_refs"),
    [
        (
            "trend_continuation",
            "trend_continuation",
            {
                "trend_alignment_bullish": 80.0,
                "fresh_order_block_bullish": 70.0,
                "open_fvg_bullish": 60.0,
            },
            {},
        ),
        (
            "pullback",
            "pullback",
            {
                "market_structure_confidence": 70.0,
                "mitigated_order_block_bullish": 65.0,
            },
            {"order_block_id": "ob-test"},
        ),
        (
            "breakout",
            "breakout",
            {"bullish_bos": 75.0, "volume_confirmation": 55.0},
            {},
        ),
        (
            "reversal",
            "reversal",
            {
                "choch_bullish": 70.0,
                "liquidity_sweep_buy_side": 65.0,
                "open_fvg_bullish": 50.0,
            },
            {},
        ),
        (
            "range_rejection",
            "range_rejection",
            {
                "range_context": 70.0,
                "liquidity_sweep_buy_side": 60.0,
                "market_structure_confidence": 55.0,
            },
            {},
        ),
    ],
)
def test_all_strategies_accept_valid_setups(
    strategy_id: str,
    setup_type: str,
    evidence: dict,
    extra_refs: dict,
) -> None:
    init_strategies()
    strategy = get_strategy_registry().get(strategy_id)
    setup = _setup(setup_type=setup_type, evidence=evidence)
    setup.reference_ids = extra_refs
    _, plan = StrategyEngine().evaluate(strategy, setup, {"min_strategy_confidence": 45.0})
    assert plan is not None, f"{setup_type} should produce a plan"
