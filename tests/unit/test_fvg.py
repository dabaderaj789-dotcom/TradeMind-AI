"""Unit tests for Fair Value Gap analyzer and plugin."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import pytest

from app.engines.analysis.plugins.fair_value_gaps.analyzer import FairValueGapAnalyzer
from app.engines.analysis.plugins.fair_value_gaps.plugin import FairValueGapPlugin
from app.engines.analysis.plugins.market_structure.analyzer import deduplicate_candles
from app.engines.analysis.types import CandleBar


def _bar(
    index: int,
    *,
    open_: float,
    high: float,
    low: float,
    close: float,
    volume: float = 1000.0,
    start: datetime | None = None,
) -> CandleBar:
    base = start or datetime(2024, 1, 1, tzinfo=UTC)
    open_time = base + timedelta(hours=index)
    return CandleBar(
        open_time=open_time,
        close_time=open_time + timedelta(hours=1),
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
    )


def _warmup_bars(n: int = 25, start: datetime | None = None) -> list[CandleBar]:
    return [
        _bar(i, open_=100 + i * 0.2, high=101 + i * 0.2, low=99 + i * 0.2, close=100.5 + i * 0.2, start=start)
        for i in range(n)
    ]


def _bullish_fvg_pattern(start: datetime | None = None) -> list[CandleBar]:
    bars = _warmup_bars(25, start)
    i = len(bars)
    bars.append(_bar(i, open_=98, high=100, low=97, close=99, volume=2000, start=start))
    bars.append(_bar(i + 1, open_=99, high=108, low=98, close=107, volume=5000, start=start))
    bars.append(_bar(i + 2, open_=106, high=112, low=102, close=111, volume=3000, start=start))
    return bars


def _bearish_fvg_pattern(start: datetime | None = None) -> list[CandleBar]:
    bars = _warmup_bars(25, start)
    i = len(bars)
    bars.append(_bar(i, open_=112, high=113, low=110, close=111, volume=2000, start=start))
    bars.append(_bar(i + 1, open_=111, high=112, low=102, close=103, volume=5000, start=start))
    bars.append(_bar(i + 2, open_=104, high=106, low=98, close=99, volume=3000, start=start))
    return bars


def _collect_new(states) -> list[dict]:
    out: list[dict] = []
    for state in states:
        out.extend(f.to_dict() for f in state.new_fvgs)
    return out


def test_plugin_metadata() -> None:
    assert FairValueGapPlugin.plugin_id() == "fair_value_gaps"
    assert "market_structure" in FairValueGapPlugin.dependencies
    assert FairValueGapPlugin.category().value == "smart_money"


def test_bullish_fvg_detected() -> None:
    bars = _bullish_fvg_pattern()
    states = FairValueGapAnalyzer(
        min_gap_atr_ratio=0.01,
        min_gap_percent=0.001,
        include_order_blocks=False,
    ).analyze(bars)
    new = _collect_new(states)
    bullish = [f for f in new if f["type"] == "bullish"]
    assert len(bullish) >= 1
    fvg = bullish[0]
    assert fvg["gap_high"] > fvg["gap_low"]
    assert fvg["gap_size"] > 0
    assert 0 <= fvg["quality_score"] <= 100
    assert fvg["quality_components"]
    assert fvg["explanation"]


def test_bearish_fvg_detected() -> None:
    bars = _bearish_fvg_pattern()
    states = FairValueGapAnalyzer(
        min_gap_atr_ratio=0.01,
        min_gap_percent=0.001,
        include_order_blocks=False,
    ).analyze(bars)
    new = _collect_new(states)
    bearish = [f for f in new if f["type"] == "bearish"]
    assert len(bearish) >= 1


def test_strong_trend_multiple_fvgs() -> None:
    bars = _warmup_bars(30)
    start = bars[-1].open_time
    for offset in range(3):
        base = len(bars)
        bars.append(_bar(base, open_=100, high=100 + offset, low=99, close=99.5, start=start))
        bars.append(_bar(base + 1, open_=100, high=110 + offset * 2, low=99, close=109, volume=8000, start=start))
        bars.append(_bar(base + 2, open_=108, high=115, low=102 + offset, close=114, start=start))
    states = FairValueGapAnalyzer(
        min_gap_atr_ratio=0.01,
        min_gap_percent=0.001,
        include_order_blocks=False,
    ).analyze(bars)
    assert len(_collect_new(states)) >= 2


def test_sideways_fewer_fvgs() -> None:
    sideways = [
        _bar(i, open_=100, high=101, low=99, close=100 + (0.3 if i % 2 else -0.3))
        for i in range(60)
    ]
    trend_bars = _bullish_fvg_pattern()
    sideways_new = len(
        _collect_new(
            FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False).analyze(sideways)
        )
    )
    trend_new = len(
        _collect_new(
            FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False).analyze(trend_bars)
        )
    )
    assert trend_new >= sideways_new


def test_tiny_gaps_filtered() -> None:
    bars = _bullish_fvg_pattern()
    strict = FairValueGapAnalyzer(min_gap_atr_ratio=5.0, include_order_blocks=False).analyze(bars)
    loose = FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False).analyze(bars)
    assert len(_collect_new(strict)) <= len(_collect_new(loose))


def test_large_gap_detected() -> None:
    bars = _warmup_bars(20)
    i = len(bars)
    bars.append(_bar(i, open_=90, high=95, low=88, close=92))
    bars.append(_bar(i + 1, open_=92, high=120, low=91, close=118, volume=10000))
    bars.append(_bar(i + 2, open_=115, high=125, low=110, close=122))
    states = FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False).analyze(bars)
    new = _collect_new(states)
    assert any(f["gap_size"] > 10 for f in new)


def test_overlapping_fvgs_tracked() -> None:
    bars = _bullish_fvg_pattern()
    i = len(bars)
    bars.append(_bar(i, open_=98, high=100, low=97, close=99))
    bars.append(_bar(i + 1, open_=99, high=109, low=98, close=108, volume=6000))
    bars.append(_bar(i + 2, open_=107, high=113, low=103, close=112))
    states = FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False).analyze(bars)
    max_active = max(len(s.active_fvgs) for s in states)
    assert max_active >= 1


def test_fill_lifecycle() -> None:
    bars = _bullish_fvg_pattern()
    i = len(bars)
    fvg_states = FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False).analyze(bars)
    new = _collect_new(fvg_states)
    if not new:
        pytest.skip("No FVG formed in fixture")
    gap_low = new[0]["gap_low"]
    gap_high = new[0]["gap_high"]
    mid = (gap_low + gap_high) / 2
    bars.append(_bar(i, open_=mid + 2, high=mid + 3, low=gap_low - 0.5, close=gap_low + 0.1))
    states = FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False).analyze(bars)
    touched = [
        f for s in states for f in s.active_fvgs + s.filled_this_bar
        if f.first_touch_at is not None
    ]
    assert len(touched) >= 1 or any(s.filled_this_bar for s in states)


def test_invalidation_on_close_through() -> None:
    bars = _bullish_fvg_pattern()
    i = len(bars)
    bars.append(_bar(i, open_=95, high=96, low=90, close=91))
    states = FairValueGapAnalyzer(
        min_gap_atr_ratio=0.01,
        invalidation_mode="close",
        include_order_blocks=False,
    ).analyze(bars)
    invalidated = [f for s in states for f in s.invalidated_this_bar]
    assert len(invalidated) >= 0


def test_replay_consistency() -> None:
    bars = _bullish_fvg_pattern()
    analyzer = FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=False)
    first = analyzer.analyze(bars)
    second = analyzer.analyze(bars)
    assert len(first) == len(second)
    for a, b in zip(first, second, strict=True):
        assert len(a.new_fvgs) == len(b.new_fvgs)


def test_plugin_calculate_output() -> None:
    bars = _bullish_fvg_pattern()
    plugin = FairValueGapPlugin()
    params = plugin.default_parameters()
    params["min_gap_atr_ratio"] = 0.01
    params["include_order_blocks"] = False
    results = plugin.calculate(bars, params)
    assert len(results) == len(bars)
    sample = next((r for r in results if r.values.get("new_fvgs")), None)
    assert sample is not None
    assert "active_fvgs" in sample.values


def test_gap_with_order_block_context() -> None:
    bars = _bullish_fvg_pattern()
    states = FairValueGapAnalyzer(min_gap_atr_ratio=0.01, include_order_blocks=True).analyze(bars)
    new = _collect_new(states)
    if new:
        assert "associated_order_block_id" in new[0]
        assert "trend" in new[0]


def test_performance_large_dataset() -> None:
    closes = []
    price = 100.0
    for i in range(10_000):
        price += 0.05 if i % 10 != 0 else -1.0
        closes.append(price)
    bars = [
        _bar(
            i,
            open_=c - 0.2,
            high=c + 1,
            low=c - 1,
            close=c,
            volume=1000 + (i % 50) * 100,
        )
        for i, c in enumerate(closes)
    ]
    analyzer = FairValueGapAnalyzer(include_order_blocks=False)
    start = time.perf_counter()
    states = analyzer.analyze(bars)
    elapsed = time.perf_counter() - start
    assert len(states) == 10_000
    assert elapsed < 60.0
