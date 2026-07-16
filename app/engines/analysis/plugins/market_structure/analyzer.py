"""Single-pass O(n) market structure analyzer.

Designed for batch, replay, and live modes — processes candles sequentially
without re-scanning history. Duplicate open_time bars are deduplicated.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from app.engines.analysis.plugins.market_structure.types import (
    BarStructureState,
    DynamicLevel,
    MarketPhase,
    StructureEvent,
    SwingLabel,
    SwingPoint,
    Trend,
)
from app.engines.analysis.types import CandleBar


def deduplicate_candles(candles: list[CandleBar]) -> list[CandleBar]:
    """Keep last bar per open_time for duplicate handling."""
    if not candles:
        return []
    by_time: dict[datetime, CandleBar] = {}
    for bar in candles:
        by_time[bar.open_time] = bar
    return [by_time[t] for t in sorted(by_time)]


class MarketStructureAnalyzer:
    """Stateful single-pass market structure engine."""

    def __init__(
        self,
        *,
        swing_sensitivity: int = 2,
        atr_period: int = 14,
        level_touch_tolerance_atr: float = 0.5,
        max_active_levels: int = 5,
        phase_lookback_swings: int = 6,
    ) -> None:
        self.swing_sensitivity = max(1, swing_sensitivity)
        self.atr_period = max(2, atr_period)
        self.level_touch_tolerance_atr = level_touch_tolerance_atr
        self.max_active_levels = max_active_levels
        self.phase_lookback_swings = phase_lookback_swings

    def analyze(self, candles: list[CandleBar]) -> list[BarStructureState]:
        bars = deduplicate_candles(candles)
        n = len(bars)
        if n == 0:
            return []

        highs = [b.high for b in bars]
        lows = [b.low for b in bars]
        closes = [b.close for b in bars]
        volumes = [b.volume for b in bars]
        atrs = _compute_atr(bars, self.atr_period)

        states: list[BarStructureState] = [BarStructureState() for _ in range(n)]
        swing_highs: list[SwingPoint] = []
        swing_lows: list[SwingPoint] = []
        all_swings: list[SwingPoint] = []
        support_levels: list[DynamicLevel] = []
        resistance_levels: list[DynamicLevel] = []
        bos_events: list[StructureEvent] = []
        choch_events: list[StructureEvent] = []
        trend = Trend.SIDEWAYS
        structural_bias = Trend.SIDEWAYS

        sens = self.swing_sensitivity

        for i in range(n):
            state = states[i]
            atr = atrs[i] or (atrs[i - 1] if i > 0 else 1.0) or 1.0

            # Confirm pivots with lag (causal / replay-safe)
            pivot_idx = i - sens
            if pivot_idx >= sens and pivot_idx + sens < n:
                if _is_pivot_high(pivot_idx, highs, sens):
                    swing = _build_swing(
                        bars, pivot_idx, is_high=True,
                        prev_swings=swing_highs, opposite_swings=swing_lows,
                        atr=atr, volumes=volumes,
                    )
                    swing_highs.append(swing)
                    all_swings.append(swing)
                    resistance_levels = _upsert_level(
                        resistance_levels, swing, is_support=False,
                        max_levels=self.max_active_levels,
                    )
                    if i == pivot_idx + sens:
                        state.is_swing_high = True
                        state.swing_type = swing.label
                        state.swing_strength = swing.strength

                if _is_pivot_low(pivot_idx, lows, sens):
                    swing = _build_swing(
                        bars, pivot_idx, is_high=False,
                        prev_swings=swing_lows, opposite_swings=swing_highs,
                        atr=atr, volumes=volumes,
                    )
                    swing_lows.append(swing)
                    all_swings.append(swing)
                    support_levels = _upsert_level(
                        support_levels, swing, is_support=True,
                        max_levels=self.max_active_levels,
                    )
                    if i == pivot_idx + sens:
                        state.is_swing_low = True
                        state.swing_type = swing.label
                        state.swing_strength = swing.strength

            trend = _detect_trend(swing_highs, swing_lows)
            state.trend = trend

            # BOS on crossing (not every bar above level)
            prev_close = closes[i - 1] if i > 0 else closes[i]
            bos = _detect_bos(
                i, bars[i], swing_highs, swing_lows, structural_bias, closes[i], prev_close,
            )
            if bos:
                bos_events.append(bos)
                state.bos = bos
                if bos.event_type == "bos_bullish":
                    structural_bias = Trend.BULLISH
                else:
                    structural_bias = Trend.BEARISH

            # CHoCH: BOS against prevailing trend
            choch = _detect_choch(bos, trend)
            if choch:
                choch_events.append(choch)
                state.choch = choch

            # Touch validation for dynamic levels
            support_levels, resistance_levels = _validate_level_touches(
                support_levels, resistance_levels,
                bars[i], atr, self.level_touch_tolerance_atr,
            )

            phase, phase_conf = _classify_phase(
                trend, swing_highs, swing_lows, closes, i, self.phase_lookback_swings, atr,
            )
            state.market_phase = phase
            state.phase_confidence = phase_conf
            state.confidence = _overall_confidence(trend, phase_conf, swing_highs, swing_lows)
            state.support_levels = sorted(support_levels, key=lambda l: -l.strength)[: self.max_active_levels]
            state.resistance_levels = sorted(resistance_levels, key=lambda l: -l.strength)[: self.max_active_levels]

        return states


def _is_pivot_high(idx: int, highs: list[float], sens: int) -> bool:
    center = highs[idx]
    for j in range(idx - sens, idx + sens + 1):
        if j == idx:
            continue
        if highs[j] >= center:
            return False
    return True


def _is_pivot_low(idx: int, lows: list[float], sens: int) -> bool:
    center = lows[idx]
    for j in range(idx - sens, idx + sens + 1):
        if j == idx:
            continue
        if lows[j] <= center:
            return False
    return True


def _build_swing(
    bars: list[CandleBar],
    idx: int,
    *,
    is_high: bool,
    prev_swings: list[SwingPoint],
    opposite_swings: list[SwingPoint],
    atr: float,
    volumes: list[float],
) -> SwingPoint:
    bar = bars[idx]
    price = bar.high if is_high else bar.low
    label = None
    if prev_swings:
        prev = prev_swings[-1]
        if is_high:
            label = SwingLabel.HH if price > prev.price else SwingLabel.LH
        else:
            label = SwingLabel.HL if price > prev.price else SwingLabel.LL

    avg_vol = sum(volumes[max(0, idx - 20) : idx + 1]) / min(idx + 1, 21)
    vol_score = min(bar.volume / avg_vol, 3.0) / 3.0 if avg_vol > 0 else 0.5

    distance = abs(price - prev_swings[-1].price) if prev_swings else atr
    dist_score = min(distance / atr, 3.0) / 3.0 if atr > 0 else 0.5

    confirmations = 0
    if label in (SwingLabel.HH, SwingLabel.HL):
        confirmations = sum(1 for s in prev_swings[-3:] if s.label in (SwingLabel.HH, SwingLabel.HL))
    elif label in (SwingLabel.LH, SwingLabel.LL):
        confirmations = sum(1 for s in prev_swings[-3:] if s.label in (SwingLabel.LH, SwingLabel.LL))

    conf_score = min(confirmations / 3.0, 1.0)
    atr_move = (bar.high - bar.low) / atr if atr > 0 else 0.5
    atr_score = min(atr_move / 2.0, 1.0)

    strength = round(0.3 * vol_score + 0.3 * dist_score + 0.2 * conf_score + 0.2 * atr_score, 4)

    return SwingPoint(
        index=idx,
        open_time=bar.open_time,
        price=price,
        is_high=is_high,
        label=label,
        strength=strength,
        volume=bar.volume,
    )


def _detect_trend(swing_highs: list[SwingPoint], swing_lows: list[SwingPoint]) -> Trend:
    recent_high_labels = [s.label for s in swing_highs[-3:] if s.label]
    recent_low_labels = [s.label for s in swing_lows[-3:] if s.label]
    bullish = sum(1 for l in recent_high_labels + recent_low_labels if l in (SwingLabel.HH, SwingLabel.HL))
    bearish = sum(1 for l in recent_high_labels + recent_low_labels if l in (SwingLabel.LH, SwingLabel.LL))
    if bullish >= 3 and bullish > bearish:
        return Trend.BULLISH
    if bearish >= 3 and bearish > bullish:
        return Trend.BEARISH
    return Trend.SIDEWAYS


def _detect_bos(
    idx: int,
    bar: CandleBar,
    swing_highs: list[SwingPoint],
    swing_lows: list[SwingPoint],
    bias: Trend,
    close: float,
    prev_close: float,
) -> StructureEvent | None:
    if swing_highs:
        level = swing_highs[-1].price
        if prev_close <= level < close and bias != Trend.BULLISH:
            return StructureEvent(
                event_type="bos_bullish",
                broken_swing_price=level,
                break_price=close,
                break_time=bar.open_time,
                break_index=idx,
                swing_index=swing_highs[-1].index,
            )
    if swing_lows:
        level = swing_lows[-1].price
        if prev_close >= level > close and bias != Trend.BEARISH:
            return StructureEvent(
                event_type="bos_bearish",
                broken_swing_price=level,
                break_price=close,
                break_time=bar.open_time,
                break_index=idx,
                swing_index=swing_lows[-1].index,
            )
    return None


def _detect_choch(bos: StructureEvent | None, trend: Trend) -> StructureEvent | None:
    if bos is None:
        return None
    if bos.event_type == "bos_bullish" and trend == Trend.BEARISH:
        return replace(bos, event_type="choch_bullish")
    if bos.event_type == "bos_bearish" and trend == Trend.BULLISH:
        return replace(bos, event_type="choch_bearish")
    return None


def _upsert_level(
    levels: list[DynamicLevel],
    swing: SwingPoint,
    *,
    is_support: bool,
    max_levels: int,
) -> list[DynamicLevel]:
    level = DynamicLevel(
        price=swing.price,
        strength=swing.strength,
        touches=1,
        created_at=swing.open_time,
        last_validated_at=swing.open_time,
        is_support=is_support,
    )
    merged = levels + [level]
    merged.sort(key=lambda l: -l.strength)
    return merged[:max_levels]


def _validate_level_touches(
    supports: list[DynamicLevel],
    resistances: list[DynamicLevel],
    bar: CandleBar,
    atr: float,
    tolerance_atr: float,
) -> tuple[list[DynamicLevel], list[DynamicLevel]]:
    tol = atr * tolerance_atr
    new_supports: list[DynamicLevel] = []
    for lvl in supports:
        if bar.low <= lvl.price + tol and bar.high >= lvl.price - tol:
            lvl = DynamicLevel(
                price=lvl.price,
                strength=min(lvl.strength + 0.1, 1.0),
                touches=lvl.touches + 1,
                created_at=lvl.created_at,
                last_validated_at=bar.open_time,
                is_support=True,
            )
        new_supports.append(lvl)

    new_resistances: list[DynamicLevel] = []
    for lvl in resistances:
        if bar.high >= lvl.price - tol and bar.low <= lvl.price + tol:
            lvl = DynamicLevel(
                price=lvl.price,
                strength=min(lvl.strength + 0.1, 1.0),
                touches=lvl.touches + 1,
                created_at=lvl.created_at,
                last_validated_at=bar.open_time,
                is_support=False,
            )
        new_resistances.append(lvl)

    return new_supports, new_resistances


def _classify_phase(
    trend: Trend,
    swing_highs: list[SwingPoint],
    swing_lows: list[SwingPoint],
    closes: list[float],
    idx: int,
    lookback_swings: int,
    atr: float,
) -> tuple[MarketPhase, float]:
    if trend in (Trend.BULLISH, Trend.BEARISH):
        return MarketPhase.TRENDING, 0.75

    recent = swing_highs[-lookback_swings:] + swing_lows[-lookback_swings:]
    if len(recent) < 2:
        return MarketPhase.RANGING, 0.4

    prices = [s.price for s in recent]
    range_width = max(prices) - min(prices)
    range_ratio = range_width / atr if atr > 0 else 1.0

    if range_ratio < 4.0:
        # Sideways — determine accumulation vs distribution from prior trend
        if len(swing_lows) >= 2 and swing_lows[-1].price > swing_lows[-2].price:
            return MarketPhase.ACCUMULATION, 0.6
        if len(swing_highs) >= 2 and swing_highs[-1].price < swing_highs[-2].price:
            return MarketPhase.DISTRIBUTION, 0.6
        return MarketPhase.RANGING, 0.55

    return MarketPhase.RANGING, 0.5


def _overall_confidence(
    trend: Trend,
    phase_conf: float,
    swing_highs: list[SwingPoint],
    swing_lows: list[SwingPoint],
) -> float:
    swing_count = len(swing_highs) + len(swing_lows)
    data_conf = min(swing_count / 10.0, 1.0)
    trend_conf = 0.8 if trend != Trend.SIDEWAYS else 0.4
    return round(0.4 * trend_conf + 0.3 * phase_conf + 0.3 * data_conf, 4)


def _compute_atr(bars: list[CandleBar], period: int) -> list[float | None]:
    trs: list[float] = []
    for i, bar in enumerate(bars):
        if i == 0:
            trs.append(bar.high - bar.low)
        else:
            prev = bars[i - 1]
            trs.append(
                max(
                    bar.high - bar.low,
                    abs(bar.high - prev.close),
                    abs(bar.low - prev.close),
                )
            )
    out: list[float | None] = [None] * len(bars)
    for i in range(len(bars)):
        if i >= period - 1:
            out[i] = sum(trs[i - period + 1 : i + 1]) / period
    return out
