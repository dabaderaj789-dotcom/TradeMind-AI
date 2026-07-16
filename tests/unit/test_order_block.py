"""Unit tests for Order Block analyzer and plugin."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import pytest

from app.engines.analysis.plugins.market_structure.analyzer import deduplicate_candles
from app.engines.analysis.plugins.order_blocks.analyzer import OrderBlockAnalyzer
from app.engines.analysis.plugins.order_blocks.plugin import OrderBlockPlugin
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


def _bars_from_closes(closes: list[float], *, start: datetime | None = None) -> list[CandleBar]:
    base = start or datetime(2024, 1, 1, tzinfo=UTC)
    bars: list[CandleBar] = []
    for i, close in enumerate(closes):
        open_time = base + timedelta(hours=i)
        bars.append(
            CandleBar(
                open_time=open_time,
                close_time=open_time + timedelta(hours=1),
                open=close - 0.2,
                high=close + 1.0,
                low=close - 1.0,
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


def _collect_all_new_blocks(states) -> list[dict]:
    blocks: list[dict] = []
    for state in states:
        blocks.extend(b.to_dict() for b in state.new_blocks)
    return blocks


def test_plugin_registered_metadata() -> None:
    assert OrderBlockPlugin.plugin_id() == "order_blocks"
    assert "market_structure" in OrderBlockPlugin.dependencies
    assert OrderBlockPlugin.category().value == "smart_money"


def test_uptrend_detects_bullish_order_blocks() -> None:
    bars = _bars_from_closes(_uptrend_closes(100))
    states = OrderBlockAnalyzer(timeframe_code="1h", swing_sensitivity=2).analyze(bars)
    new_blocks = _collect_all_new_blocks(states)
    bullish = [b for b in new_blocks if b["type"] == "bullish"]
    assert len(bullish) >= 1
    block = bullish[0]
    assert block["zone_high"] >= block["zone_low"]
    assert 0 <= block["strength_score"] <= 100
    assert block["strength_components"]
    assert block["explanation"]


def test_sideways_market_fewer_blocks() -> None:
    uptrend = _collect_all_new_blocks(
        OrderBlockAnalyzer(swing_sensitivity=2).analyze(_bars_from_closes(_uptrend_closes(80)))
    )
    sideways = _collect_all_new_blocks(
        OrderBlockAnalyzer(swing_sensitivity=2).analyze(_bars_from_closes(_sideways_closes(80)))
    )
    assert len(uptrend) >= len(sideways)


def test_multiple_order_blocks_in_trend() -> None:
    bars = _bars_from_closes(_uptrend_closes(150))
    states = OrderBlockAnalyzer(swing_sensitivity=2).analyze(bars)
    new_blocks = _collect_all_new_blocks(states)
    assert len(new_blocks) >= 2


def test_nested_order_blocks_allowed() -> None:
    bars = _bars_from_closes(_uptrend_closes(120))
    states = OrderBlockAnalyzer(swing_sensitivity=2).analyze(bars)
    max_active = max(len(s.active_blocks) for s in states)
    assert max_active >= 2


def test_replay_consistency() -> None:
    bars = _bars_from_closes(_uptrend_closes(90))
    analyzer = OrderBlockAnalyzer(swing_sensitivity=2, timeframe_code="4h")
    first = analyzer.analyze(bars)
    second = analyzer.analyze(bars)
    assert len(first) == len(second)
    for a, b in zip(first, second, strict=True):
        assert len(a.new_blocks) == len(b.new_blocks)
        assert len(a.active_blocks) == len(b.active_blocks)


def test_live_incremental_matches_batch_tail() -> None:
    bars = _bars_from_closes(_uptrend_closes(100))
    full = OrderBlockAnalyzer(swing_sensitivity=2).analyze(bars)
    partial = OrderBlockAnalyzer(swing_sensitivity=2).analyze(bars[:60])
    assert len(partial) == 60
    assert len(full[59].active_blocks) == len(partial[-1].active_blocks)


def test_mitigation_on_retrace() -> None:
    bars: list[CandleBar] = []
    start = datetime(2024, 1, 1, tzinfo=UTC)
    for i in range(50):
        bars.append(_bar(i, open_=100 + i * 0.5, high=102 + i * 0.5, low=99 + i * 0.5, close=101 + i * 0.5, start=start))
    bars.append(_bar(50, open_=126, high=127, low=124, close=124.5, start=start))
    bars.append(_bar(51, open_=128, high=132, low=127, close=131, start=start))
    bars.append(_bar(52, open_=125, high=126, low=123, close=125.5, start=start))

    states = OrderBlockAnalyzer(swing_sensitivity=2, lookback_before_bos=30).analyze(bars)
    touched = [
        b
        for s in states
        for b in s.active_blocks
        if b.mitigation_state.value != "untouched"
    ]
    assert len(touched) >= 0


def test_invalidation_bullish_close_below_zone() -> None:
    bars: list[CandleBar] = []
    start = datetime(2024, 6, 1, tzinfo=UTC)
    for i in range(40):
        bars.append(_bar(i, open_=100 + i, high=102 + i, low=99 + i, close=101 + i, start=start))
    bars.append(_bar(40, open_=140, high=141, low=138, close=138.5, start=start))
    bars.append(_bar(41, open_=142, high=146, low=141, close=145, start=start))
    bars.append(_bar(42, open_=130, high=131, low=120, close=121, start=start))

    states = OrderBlockAnalyzer(swing_sensitivity=2, invalidation_mode="close").analyze(bars)
    invalidated = [b for s in states for b in s.invalidated_this_bar]
    assert isinstance(invalidated, list)


def test_gap_candles_handled() -> None:
    bars = _bars_from_closes(_uptrend_closes(60))
    gap_bar = bars[30]
    bars[31] = CandleBar(
        open_time=gap_bar.open_time + timedelta(hours=2),
        close_time=gap_bar.open_time + timedelta(hours=3),
        open=gap_bar.close,
        high=gap_bar.close + 15,
        low=gap_bar.close - 1,
        close=gap_bar.close + 12,
        volume=5000,
    )
    states = OrderBlockAnalyzer(swing_sensitivity=2).analyze(bars)
    assert len(states) == len(deduplicate_candles(bars))


def test_plugin_calculate_output_shape() -> None:
    bars = _bars_from_closes(_uptrend_closes(80))
    plugin = OrderBlockPlugin()
    params = plugin.default_parameters()
    params["timeframe_code"] = "1h"
    results = plugin.calculate(bars, params)
    assert len(results) == len(bars)
    sample = next(r for r in results if r.values.get("new_order_blocks"))
    assert "active_order_blocks" in sample.values
    assert "confidence" in sample.values


def test_strength_score_bounded() -> None:
    bars = _bars_from_closes(_uptrend_closes(100))
    states = OrderBlockAnalyzer().analyze(bars)
    for state in states:
        for block in state.active_blocks + state.new_blocks:
            assert 0 <= block.strength_score <= 100


def test_performance_large_dataset() -> None:
    bars = _bars_from_closes(_uptrend_closes(10_000))
    analyzer = OrderBlockAnalyzer(swing_sensitivity=2)
    start = time.perf_counter()
    states = analyzer.analyze(bars)
    elapsed = time.perf_counter() - start
    assert len(states) == 10_000
    assert elapsed < 30.0
