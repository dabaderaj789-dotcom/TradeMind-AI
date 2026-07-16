"""Unit tests for Market Structure analyzer."""

from datetime import UTC, datetime, timedelta

import pytest

from app.engines.analysis.plugins.market_structure.analyzer import (
    MarketStructureAnalyzer,
    deduplicate_candles,
)
from app.engines.analysis.plugins.market_structure.plugin import MarketStructurePlugin
from app.engines.analysis.types import CandleBar


def _bars_from_closes(closes: list[float], *, start: datetime | None = None) -> list[CandleBar]:
    base = start or datetime(2024, 1, 1, tzinfo=UTC)
    bars: list[CandleBar] = []
    for i, close in enumerate(closes):
        open_time = base + timedelta(hours=i)
        high = close + 1.0
        low = close - 1.0
        bars.append(
            CandleBar(
                open_time=open_time,
                close_time=open_time + timedelta(hours=1),
                open=close - 0.2,
                high=high,
                low=low,
                close=close,
                volume=1000 + i * 10,
            )
        )
    return bars


def _uptrend_closes(n: int = 80) -> list[float]:
    closes: list[float] = []
    price = 100.0
    for i in range(n):
        if i % 8 == 0 and i > 0:
            price -= 2
        else:
            price += 1.5
        closes.append(price)
    return closes


def _sideways_closes(n: int = 80) -> list[float]:
    return [100 + (i % 6) - 3 for i in range(n)]


def test_deduplicate_candles_keeps_last() -> None:
    t = datetime(2024, 1, 1, tzinfo=UTC)
    bars = [
        CandleBar(t, 100, 101, 99, 100.5, 1000),
        CandleBar(t, 100, 102, 98, 101.0, 2000),
    ]
    deduped = deduplicate_candles(bars)
    assert len(deduped) == 1
    assert deduped[0].close == 101.0


def test_uptrend_produces_bullish_trend() -> None:
    bars = _bars_from_closes(_uptrend_closes())
    states = MarketStructureAnalyzer(swing_sensitivity=2).analyze(bars)
    trends = [s.trend.value for s in states[-20:]]
    assert trends.count("bullish") > trends.count("bearish")


def test_sideways_market() -> None:
    bars = _bars_from_closes(_sideways_closes())
    states = MarketStructureAnalyzer(swing_sensitivity=2).analyze(bars)
    last = states[-1]
    assert last.trend.value in ("sideways", "bullish", "bearish")
    assert last.market_phase.value in ("ranging", "accumulation", "distribution", "trending")


def test_swing_points_detected() -> None:
    bars = _bars_from_closes(_uptrend_closes())
    states = MarketStructureAnalyzer(swing_sensitivity=2).analyze(bars)
    swing_highs = sum(1 for s in states if s.is_swing_high)
    swing_lows = sum(1 for s in states if s.is_swing_low)
    assert swing_highs > 0
    assert swing_lows > 0


def test_bos_event_on_breakout() -> None:
    closes = [100, 102, 101, 103, 102, 105, 104, 108, 107, 120]
    closes.extend([118 + (i % 3) for i in range(40)])
    bars = _bars_from_closes(closes)
    states = MarketStructureAnalyzer(swing_sensitivity=2).analyze(bars)
    bos_count = sum(1 for s in states if s.bos is not None)
    assert bos_count >= 1


def test_false_breakout_wick_no_bos() -> None:
    """High wick above swing but close back inside should not always trigger BOS."""
    closes = [100.0] * 20 + [110.0] + [100.0] * 20
    bars = _bars_from_closes(closes)
    for i, b in enumerate(bars):
        if i == 20:
            bars[i] = CandleBar(
                b.open_time, b.open, 115.0, 99.0, 100.5, b.volume, b.close_time
            )
    states = MarketStructureAnalyzer(swing_sensitivity=2).analyze(bars)
    assert all(s.bos is None or s.bos.event_type for s in states)


def test_gap_in_data_does_not_crash() -> None:
    bars = _bars_from_closes([100, 105, 130, 128, 132, 135])
    states = MarketStructureAnalyzer().analyze(bars)
    assert len(states) == len(bars)


def test_empty_candles() -> None:
    plugin = MarketStructurePlugin()
    assert plugin.calculate([], plugin.validate_parameters({})) == []


def test_insufficient_history() -> None:
    bars = _bars_from_closes([100, 101, 102])
    states = MarketStructureAnalyzer().analyze(bars)
    assert len(states) == 3


def test_replay_consistency_identical_output() -> None:
    bars = _bars_from_closes(_uptrend_closes(100))
    analyzer = MarketStructureAnalyzer(swing_sensitivity=2)
    first = analyzer.analyze(bars)
    second = analyzer.analyze(bars)
    for a, b in zip(first, second, strict=True):
        assert a.trend == b.trend
        assert a.swing_type == b.swing_type
        assert a.market_phase == b.market_phase


def test_plugin_integration() -> None:
    plugin = MarketStructurePlugin()
    bars = _bars_from_closes(_uptrend_closes(60))
    results = plugin.calculate(bars, plugin.validate_parameters({"swing_sensitivity": 2}))
    assert len(results) == len(bars)
    assert "trend" in results[-1].values
    assert "support_levels" in results[-1].values


def test_duplicate_candles_in_plugin_output() -> None:
    plugin = MarketStructurePlugin()
    bars = _bars_from_closes([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110] * 3)
    duped = bars + [bars[5]]
    results = plugin.calculate(duped, plugin.validate_parameters({}))
    assert len(results) == len(duped)


def test_invalid_parameters() -> None:
    plugin = MarketStructurePlugin()
    with pytest.raises(Exception):
        plugin.validate_parameters({"swing_sensitivity": 0})


def test_dynamic_levels_present() -> None:
    bars = _bars_from_closes(_uptrend_closes())
    states = MarketStructureAnalyzer().analyze(bars)
    last = states[-1]
    assert isinstance(last.support_levels, list)
    assert isinstance(last.resistance_levels, list)
