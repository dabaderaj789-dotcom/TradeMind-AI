"""Unit tests for Trade Setup Engine."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from app.engines.trade_setup.detectors.base import build_default_registry
from app.engines.trade_setup.engine import TradeSetupEngine, TradeSetupEngineConfig
from app.engines.trade_setup.evidence import extract_evidence
from app.engines.trade_setup.scoring import score_candidate
from app.engines.trade_setup.types import (
    BarAnalysisContext,
    PriceZone,
    SetupDirection,
    SetupType,
    TradeSetupCandidate,
    confidence_level_from_score,
)


def _ctx(
    index: int,
    *,
    trend: str = "bullish",
    bos: dict | None = None,
    choch: dict | None = None,
    phase: str = "trending",
    ob: list | None = None,
    fvg: list | None = None,
    sweeps: list | None = None,
    rsi: float | None = 50.0,
) -> BarAnalysisContext:
    t = datetime(2024, 1, 1, tzinfo=UTC) + timedelta(hours=index)
    return BarAnalysisContext(
        open_time=t,
        bar_index=index,
        close=105.0,
        high=106.0,
        low=104.0,
        volume=2000.0,
        market_structure={
            "trend": trend,
            "market_phase": phase,
            "confidence": 0.8,
            "bos": bos,
            "choch": choch,
            "resistance_levels": [{"price": 110.0}],
            "support_levels": [{"price": 100.0}],
        },
        order_blocks={"active_order_blocks": ob or []},
        fair_value_gaps={"active_fvgs": fvg or []},
        liquidity_sweeps={"new_sweeps": sweeps or [], "active_sweeps": sweeps or []},
        rsi=rsi,
        vwap=104.5,
        atr=1.5,
    )


def test_confidence_levels() -> None:
    assert confidence_level_from_score(90).value == "very_high"
    assert confidence_level_from_score(75).value == "high"
    assert confidence_level_from_score(55).value == "medium"
    assert confidence_level_from_score(30).value == "low"


def test_evidence_extraction_bullish_bos() -> None:
    ctx = _ctx(
        10,
        bos={"type": "bos_bullish", "break_price": 105.0},
        ob=[{
            "type": "bullish",
            "status": "fresh",
            "strength_score": 75.0,
            "zone_high": 104.5,
            "zone_low": 103.0,
            "order_block_id": "ob1",
        }],
    )
    evidence = extract_evidence(ctx)
    assert evidence.get("bullish_bos", 0) > 0
    assert evidence.get("fresh_order_block_bullish", 0) > 0


def test_trend_continuation_detector() -> None:
    ctx = _ctx(
        20,
        ob=[{
            "type": "bullish",
            "status": "fresh",
            "strength_score": 70.0,
            "zone_high": 104.5,
            "zone_low": 103.0,
            "order_block_id": "ob1",
        }],
    )
    engine = TradeSetupEngine()
    result = engine.detect(
        [ctx],
        TradeSetupEngineConfig(min_confidence=30.0, enabled_setup_types=["trend_continuation"]),
    )
    assert any(s.setup_type == SetupType.TREND_CONTINUATION for s in result.setups)


def test_breakout_detector() -> None:
    ctx = _ctx(
        15,
        bos={"type": "bos_bullish", "break_index": 15, "break_price": 106.0},
        ob=[{
            "type": "bullish",
            "status": "fresh",
            "strength_score": 60.0,
            "zone_high": 105.5,
            "zone_low": 104.0,
            "order_block_id": "ob2",
        }],
    )
    engine = TradeSetupEngine()
    result = engine.detect(
        [ctx],
        TradeSetupEngineConfig(min_confidence=30.0, enabled_setup_types=["breakout"]),
    )
    assert any(s.setup_type == SetupType.BREAKOUT for s in result.setups)


def test_reversal_detector() -> None:
    ctx = _ctx(
        25,
        trend="bearish",
        choch={"type": "choch_bullish"},
        sweeps=[{
            "type": "buy_side",
            "status": "confirmed",
            "strength_score": 80.0,
            "sweep_id": "sw1",
        }],
        rsi=28.0,
    )
    engine = TradeSetupEngine()
    result = engine.detect(
        [ctx],
        TradeSetupEngineConfig(min_confidence=25.0, enabled_setup_types=["reversal"]),
    )
    assert any(s.setup_type == SetupType.REVERSAL for s in result.setups)


def test_range_rejection_detector() -> None:
    ctx = _ctx(
        30,
        trend="sideways",
        phase="ranging",
        sweeps=[{
            "type": "sell_side",
            "status": "confirmed",
            "strength_score": 75.0,
            "sweep_id": "sw2",
        }],
    )
    engine = TradeSetupEngine()
    result = engine.detect(
        [ctx],
        TradeSetupEngineConfig(min_confidence=25.0, enabled_setup_types=["range_rejection"]),
    )
    assert any(s.setup_type == SetupType.RANGE_REJECTION for s in result.setups)


def test_false_positive_filtered_by_min_confidence() -> None:
    ctx = _ctx(5, trend="sideways", phase="ranging")
    engine = TradeSetupEngine()
    result = engine.detect([ctx], TradeSetupEngineConfig(min_confidence=95.0))
    assert len(result.setups) == 0


def test_scored_setup_has_zones_and_rr() -> None:
    candidate = TradeSetupCandidate(
        setup_type=SetupType.PULLBACK,
        direction=SetupDirection.BULLISH,
        evidence_scores={"trend_alignment_bullish": 80.0, "volume_confirmation": 60.0},
        entry_zone=PriceZone(high=105.0, low=104.0, label="order_block"),
        stop_loss_zone=PriceZone(high=104.0, low=102.0, label="stop_loss"),
        target_zones=[
            PriceZone(high=107.0, low=106.5, label="target_1"),
            PriceZone(high=109.0, low=108.5, label="target_2"),
        ],
        explanation="Test pullback",
        detected_at=datetime.now(UTC),
        detected_index=1,
    )
    scored = score_candidate(candidate, weights={"trend_alignment_bullish": 1.0, "volume_confirmation": 0.5}, min_confidence=30.0, expiration_bars=20)
    assert scored is not None
    assert scored.risk_reward is not None
    assert scored.risk_reward > 0


def test_replay_consistency() -> None:
    contexts = [
        _ctx(i, bos={"type": "bos_bullish"} if i % 10 == 0 else None)
        for i in range(50)
    ]
    config = TradeSetupEngineConfig(min_confidence=40.0)
    engine = TradeSetupEngine()
    first = engine.detect(contexts, config)
    second = engine.detect(contexts, config)
    assert len(first.setups) == len(second.setups)
    sig_first = [(s.setup_type, s.direction, round(s.confidence_score, 2)) for s in first.setups]
    sig_second = [(s.setup_type, s.direction, round(s.confidence_score, 2)) for s in second.setups]
    assert sig_first == sig_second


def test_registry_has_five_detectors() -> None:
    registry = build_default_registry()
    assert len(registry.all()) == 5


def test_performance_benchmark() -> None:
    contexts = [_ctx(i) for i in range(2000)]
    engine = TradeSetupEngine()
    start = time.perf_counter()
    result = engine.detect(contexts, TradeSetupEngineConfig(min_confidence=45.0))
    elapsed = time.perf_counter() - start
    assert result.bars_scanned == 2000
    assert elapsed < 30.0
