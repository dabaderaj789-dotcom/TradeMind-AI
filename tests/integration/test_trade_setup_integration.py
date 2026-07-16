"""Integration-style tests for Trade Setup Engine with synthetic analysis."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.engines.trade_setup.engine import TradeSetupEngine, TradeSetupEngineConfig
from app.engines.trade_setup.types import BarAnalysisContext


def _synthetic_series(n: int = 100) -> list[BarAnalysisContext]:
    contexts: list[BarAnalysisContext] = []
    for i in range(n):
        trend = "bullish" if i > 40 else "sideways"
        bos = None
        if i == 50:
            bos = {"type": "bos_bullish", "break_index": 50, "break_price": 110.0}
        ob = []
        if i == 48:
            ob = [{
                "type": "bullish",
                "status": "fresh",
                "strength_score": 72.0,
                "zone_high": 108.5,
                "zone_low": 107.0,
                "order_block_id": "ob-int-1",
            }]
        t = datetime(2024, 3, 1, tzinfo=UTC) + timedelta(hours=i)
        contexts.append(
            BarAnalysisContext(
                open_time=t,
                bar_index=i,
                close=105.0 + i * 0.1,
                high=106.0 + i * 0.1,
                low=104.0 + i * 0.1,
                volume=1500.0,
                market_structure={
                    "trend": trend,
                    "market_phase": "trending" if trend != "sideways" else "ranging",
                    "confidence": 0.75,
                    "bos": bos,
                    "choch": None,
                    "resistance_levels": [{"price": 115.0}],
                    "support_levels": [{"price": 100.0}],
                },
                order_blocks={"active_order_blocks": ob, "new_order_blocks": ob if i == 48 else []},
                fair_value_gaps={"active_fvgs": []},
                liquidity_sweeps={"active_sweeps": [], "new_sweeps": []},
                rsi=55.0,
                vwap=105.0,
                atr=1.2,
            )
        )
    return contexts


def test_integration_detects_setups_from_synthetic_analysis() -> None:
    contexts = _synthetic_series(80)
    engine = TradeSetupEngine()
    result = engine.detect(contexts, TradeSetupEngineConfig(min_confidence=35.0))
    assert result.bars_scanned == 80
    assert len(result.setups) >= 1
    setup = result.setups[0]
    assert setup.entry_zone is not None
    assert setup.stop_loss_zone is not None
    assert len(setup.target_zones) >= 2
    assert setup.explanation


def test_incremental_scan_subset() -> None:
    contexts = _synthetic_series(200)
    full = TradeSetupEngine().detect(
        contexts, TradeSetupEngineConfig(min_confidence=35.0),
    )
    partial = TradeSetupEngine().detect(
        contexts,
        TradeSetupEngineConfig(min_confidence=35.0, scan_bars=50),
    )
    assert partial.bars_scanned == 50
    assert len(partial.setups) <= len(full.setups)
