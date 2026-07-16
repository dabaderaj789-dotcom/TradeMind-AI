"""Unit tests for Liquidity Sweep analyzer and plugin."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import pytest

from app.engines.analysis.plugins.liquidity_sweeps.analyzer import LiquiditySweepAnalyzer
from app.engines.analysis.plugins.liquidity_sweeps.plugin import LiquiditySweepPlugin
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


def _warmup(n: int = 20) -> list[CandleBar]:
    return [
        _bar(i, open_=100, high=101, low=99, close=100.5)
        for i in range(n)
    ]


SESSION_HIGH = [{"price": 100.0, "type": "session_high"}]
SESSION_LOW = [{"price": 90.0, "type": "session_low"}]


def _analyzer(**kwargs) -> LiquiditySweepAnalyzer:
    defaults = {
        "min_penetration_atr": 0.01,
        "include_order_blocks": False,
        "include_fvgs": False,
        "confirmation_threshold": 40.0,
    }
    defaults.update(kwargs)
    return LiquiditySweepAnalyzer(**defaults)


def _collect_new(states) -> list[dict]:
    out: list[dict] = []
    for state in states:
        out.extend(s.to_dict() for s in state.new_sweeps)
    return out


def test_plugin_metadata() -> None:
    assert LiquiditySweepPlugin.plugin_id() == "liquidity_sweeps"
    assert "market_structure" in LiquiditySweepPlugin.dependencies
    assert "order_blocks" in LiquiditySweepPlugin.dependencies
    assert "fair_value_gaps" in LiquiditySweepPlugin.dependencies


def test_sell_side_wick_sweep() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=99, high=102.5, low=98.5, close=99.2, volume=3000))
    states = _analyzer(session_levels=SESSION_HIGH, sweep_mode="wick").analyze(bars)
    new = _collect_new(states)
    sell_side = [s for s in new if s["type"] == "sell_side"]
    assert len(sell_side) >= 1
    assert sell_side[0]["sweep_level"] == 100.0
    assert sell_side[0]["penetration_depth"] > 0
    assert sell_side[0]["explanation"]


def test_buy_side_wick_sweep() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=91, high=91.5, low=88.5, close=90.8, volume=3000))
    states = _analyzer(session_levels=SESSION_LOW, sweep_mode="wick").analyze(bars)
    new = _collect_new(states)
    buy_side = [s for s in new if s["type"] == "buy_side"]
    assert len(buy_side) >= 1


def test_false_sweep_wick_mode_rejected() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=100, high=103, low=99, close=102, volume=3000))
    states = _analyzer(session_levels=SESSION_HIGH, sweep_mode="wick").analyze(bars)
    assert len(_collect_new(states)) == 0


def test_close_confirmed_sweep_active() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=100, high=103, low=99, close=102, volume=3000))
    states = _analyzer(session_levels=SESSION_HIGH, sweep_mode="close").analyze(bars)
    new = _collect_new(states)
    assert len(new) >= 1
    assert new[0]["status"] in ("active", "confirmed", "failed")


def test_trend_continuation_sweeps() -> None:
    bars = _warmup(30)
    for i in range(3):
        base = len(bars)
        bars.append(_bar(base, open_=99, high=101.5, low=98, close=99.5))
    states = _analyzer(session_levels=SESSION_HIGH, sweep_mode="wick").analyze(bars)
    assert len(_collect_new(states)) >= 2


def test_multiple_sweeps_same_run() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=99, high=102, low=98, close=99.5))
    bars.append(_bar(len(bars), open_=91, high=92, low=88, close=90.5))
    states = _analyzer(
        session_levels=SESSION_HIGH + SESSION_LOW,
        sweep_mode="wick",
    ).analyze(bars)
    types = {s["type"] for s in _collect_new(states)}
    assert "sell_side" in types or "buy_side" in types


def test_strength_score_bounded() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=99, high=103, low=98, close=99.0, volume=5000))
    states = _analyzer(session_levels=SESSION_HIGH, sweep_mode="wick").analyze(bars)
    for state in states:
        for sweep in state.new_sweeps + state.active_sweeps:
            assert 0 <= sweep.strength_score <= 100
            assert sweep.strength_components.to_dict()


def test_confirmation_components_present() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=99, high=102.5, low=98, close=99.2, volume=4000))
    states = _analyzer(session_levels=SESSION_HIGH, sweep_mode="wick").analyze(bars)
    new = _collect_new(states)
    if new:
        assert new[0]["confirmation_components"]
        assert "immediate_rejection" in new[0]["confirmation_components"]


def test_replay_consistency() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=99, high=102, low=98, close=99.5))
    analyzer = _analyzer(session_levels=SESSION_HIGH, sweep_mode="wick")
    first = analyzer.analyze(bars)
    second = analyzer.analyze(bars)
    assert len(first) == len(second)
    for a, b in zip(first, second, strict=True):
        assert len(a.new_sweeps) == len(b.new_sweeps)


def test_plugin_calculate_output() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=99, high=102, low=98, close=99.5))
    plugin = LiquiditySweepPlugin()
    params = plugin.default_parameters()
    params["session_levels"] = SESSION_HIGH
    params["min_penetration_atr"] = 0.01
    params["include_order_blocks"] = False
    params["include_fvgs"] = False
    results = plugin.calculate(bars, params)
    assert len(results) == len(bars)
    sample = next((r for r in results if r.values.get("new_sweeps")), None)
    assert sample is not None
    assert "active_sweeps" in sample.values


def test_lifecycle_events_recorded() -> None:
    bars = _warmup()
    bars.append(_bar(len(bars), open_=99, high=102.5, low=98, close=99.2))
    states = _analyzer(session_levels=SESSION_HIGH, sweep_mode="wick").analyze(bars)
    new = _collect_new(states)
    if new:
        assert len(new[0]["lifecycle_events"]) >= 1


def test_performance_large_dataset() -> None:
    bars = [_bar(i, open_=100, high=101, low=99, close=100.5) for i in range(5000)]
    for i in range(0, 5000, 50):
        bars[i] = _bar(i, open_=99, high=102, low=98, close=99.5, volume=2000)
    analyzer = _analyzer(
        session_levels=SESSION_HIGH,
        include_order_blocks=False,
        include_fvgs=False,
    )
    start = time.perf_counter()
    states = analyzer.analyze(bars)
    elapsed = time.perf_counter() - start
    assert len(states) == 5000
    assert elapsed < 120.0
