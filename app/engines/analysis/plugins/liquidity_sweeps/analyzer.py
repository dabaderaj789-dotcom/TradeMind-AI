"""Liquidity Sweep detection analyzer."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from typing import Any

from app.engines.analysis.plugins.fair_value_gaps.analyzer import FairValueGapAnalyzer
from app.engines.analysis.plugins.fair_value_gaps.types import FairValueGap
from app.engines.analysis.plugins.liquidity_sweeps.types import (
    BarLiquiditySweepState,
    ConfirmationComponents,
    LevelType,
    LiquidityLevel,
    LiquiditySweep,
    StrengthComponents,
    SweepStatus,
    SweepType,
    new_sweep_id,
)
from app.engines.analysis.plugins.market_structure.analyzer import (
    MarketStructureAnalyzer,
    _compute_atr,
    deduplicate_candles,
)
from app.engines.analysis.plugins.market_structure.types import BarStructureState, StructureEvent
from app.engines.analysis.plugins.order_blocks.analyzer import OrderBlockAnalyzer
from app.engines.analysis.plugins.order_blocks.types import OrderBlock
from app.engines.analysis.types import CandleBar


class LiquiditySweepAnalyzer:
    """Single-pass O(n) liquidity sweep engine with MS, OB, and FVG context."""

    def __init__(
        self,
        *,
        timeframe_code: str = "1h",
        sweep_mode: str = "wick",
        min_penetration_atr: float = 0.05,
        max_lookback: int = 100,
        equal_level_tolerance_atr: float = 0.15,
        confirmation_bars: int = 3,
        confirmation_threshold: float = 50.0,
        swing_sensitivity: int = 2,
        atr_period: int = 14,
        sm_proximity_atr: float = 3.0,
        max_active_sweeps: int = 100,
        strength_weights: dict[str, float] | None = None,
        include_order_blocks: bool = True,
        include_fvgs: bool = True,
        session_levels: list[dict[str, Any]] | None = None,
    ) -> None:
        self.timeframe_code = timeframe_code
        self.sweep_mode = sweep_mode
        self.min_penetration_atr = min_penetration_atr
        self.max_lookback = max_lookback
        self.equal_level_tolerance_atr = equal_level_tolerance_atr
        self.confirmation_bars = confirmation_bars
        self.confirmation_threshold = confirmation_threshold
        self.swing_sensitivity = swing_sensitivity
        self.atr_period = atr_period
        self.sm_proximity_atr = sm_proximity_atr
        self.max_active_sweeps = max_active_sweeps
        self.include_order_blocks = include_order_blocks
        self.include_fvgs = include_fvgs
        self.session_levels = session_levels or []
        self.strength_weights = strength_weights or {
            "penetration_depth": 0.20,
            "rejection_strength": 0.25,
            "volume": 0.15,
            "atr": 0.10,
            "market_structure_context": 0.15,
            "smart_money_context": 0.15,
        }

    def analyze(self, candles: list[CandleBar]) -> list[BarLiquiditySweepState]:
        bars = deduplicate_candles(candles)
        n = len(bars)
        if n == 0:
            return []

        ms_analyzer = MarketStructureAnalyzer(
            swing_sensitivity=self.swing_sensitivity,
            atr_period=self.atr_period,
        )
        ms_states = ms_analyzer.analyze(bars)
        atrs = _compute_atr(bars, self.atr_period)

        ob_states: list[Any] = []
        if self.include_order_blocks:
            ob_states = OrderBlockAnalyzer(
                timeframe_code=self.timeframe_code,
                swing_sensitivity=self.swing_sensitivity,
                atr_period=self.atr_period,
            ).analyze(bars)

        fvg_states: list[Any] = []
        if self.include_fvgs:
            fvg_states = FairValueGapAnalyzer(
                timeframe_code=self.timeframe_code,
                swing_sensitivity=self.swing_sensitivity,
                atr_period=self.atr_period,
                include_order_blocks=False,
            ).analyze(bars)

        liquidity_levels: list[LiquidityLevel] = _init_session_levels(bars, self.session_levels)
        all_sweeps: list[LiquiditySweep] = []
        recent_level_keys: set[str] = set()
        bar_states: list[BarLiquiditySweepState] = []

        for i in range(n):
            bar = bars[i]
            atr = atrs[i] or (atrs[i - 1] if i > 0 else 1.0) or 1.0
            ms = ms_states[i]

            _update_liquidity_levels(
                bars, i, ms, liquidity_levels, atr,
                self.swing_sensitivity, self.equal_level_tolerance_atr,
            )

            new_sweeps: list[LiquiditySweep] = []
            confirmed_bar: list[LiquiditySweep] = []
            failed_bar: list[LiquiditySweep] = []
            invalidated_bar: list[LiquiditySweep] = []

            active_obs = ob_states[i].active_blocks if ob_states and i < len(ob_states) else []
            active_fvgs = fvg_states[i].active_fvgs if fvg_states and i < len(fvg_states) else []

            for sweep in list(all_sweeps):
                if sweep.status not in (SweepStatus.ACTIVE, SweepStatus.CONFIRMED):
                    continue
                prev = sweep.status
                self._update_sweep(
                    sweep, bar, i, atr, ms, active_obs, active_fvgs,
                )
                if sweep.status == SweepStatus.CONFIRMED and prev == SweepStatus.ACTIVE:
                    confirmed_bar.append(sweep)
                elif sweep.status == SweepStatus.FAILED and prev != SweepStatus.FAILED:
                    failed_bar.append(sweep)
                elif sweep.status == SweepStatus.INVALIDATED and prev != SweepStatus.INVALIDATED:
                    invalidated_bar.append(sweep)

            lookback_levels = _levels_in_lookback(liquidity_levels, i, self.max_lookback)
            for level in lookback_levels:
                created = self._try_detect_sweep(
                    bar, i, level, atr, ms, active_obs, active_fvgs, recent_level_keys,
                )
                if created is not None:
                    all_sweeps.append(created)
                    new_sweeps.append(created)
                    recent_level_keys.add(created._level_key)

            if len(recent_level_keys) > 500:
                recent_level_keys.clear()

            active = [
                s for s in all_sweeps
                if s.status in (SweepStatus.ACTIVE, SweepStatus.CONFIRMED)
            ]
            if len(active) > self.max_active_sweeps:
                active = active[-self.max_active_sweeps :]

            bar_states.append(
                BarLiquiditySweepState(
                    active_sweeps=[replace(s) for s in active],
                    new_sweeps=[replace(s) for s in new_sweeps],
                    confirmed_this_bar=[replace(s) for s in confirmed_bar],
                    failed_this_bar=[replace(s) for s in failed_bar],
                    invalidated_this_bar=[replace(s) for s in invalidated_bar],
                )
            )

        return bar_states

    def _try_detect_sweep(
        self,
        bar: CandleBar,
        index: int,
        level: LiquidityLevel,
        atr: float,
        ms: BarStructureState,
        active_obs: list[OrderBlock],
        active_fvgs: list[FairValueGap],
        recent_keys: set[str],
    ) -> LiquiditySweep | None:
        min_pen = atr * self.min_penetration_atr
        level_key = f"{level.level_type.value}:{level.price:.6f}"

        if level_key in recent_keys:
            return None

        is_high_level = level.level_type in (
            LevelType.SWING_HIGH,
            LevelType.EQUAL_HIGH,
            LevelType.SESSION_HIGH,
        )

        if is_high_level:
            sweep_type = SweepType.SELL_SIDE
            penetration = bar.high - level.price
            if penetration < min_pen:
                return None
            if self.sweep_mode == "wick" and bar.close >= level.price:
                return None
            extreme = bar.high
            rejected = bar.close < level.price
        else:
            sweep_type = SweepType.BUY_SIDE
            penetration = level.price - bar.low
            if penetration < min_pen:
                return None
            if self.sweep_mode == "wick" and bar.close <= level.price:
                return None
            extreme = bar.low
            rejected = bar.close > level.price

        pen_depth = penetration / atr if atr > 0 else penetration
        rejection = abs(bar.close - level.price) / atr if atr > 0 else 0.0

        ob_id, fvg_id = _nearest_sm_context(
            level.price, active_obs, active_fvgs, atr, self.sm_proximity_atr,
        )

        explanation = (
            f"{sweep_type.value.replace('_', ' ').title()} sweep of "
            f"{level.level_type.value} at {level.price:.4f}: "
            f"penetration {pen_depth:.2f}×ATR"
        )
        if self.sweep_mode == "wick":
            explanation += " with wick rejection"
        else:
            explanation += " (close-confirmed)"

        sweep = LiquiditySweep(
            sweep_id=new_sweep_id(),
            sweep_type=sweep_type,
            sweep_level=level.price,
            level_type=level.level_type,
            penetration_depth=penetration,
            created_at=bar.open_time,
            created_index=index,
            sweep_bar_extreme=extreme,
            timeframe_code=self.timeframe_code,
            trend=ms.trend.value,
            market_phase=ms.market_phase.value,
            associated_bos=_event_dict(ms.bos),
            associated_choch=_event_dict(ms.choch),
            related_order_block_id=ob_id,
            related_fvg_id=fvg_id,
            nearest_swing_index=level.source_index,
            nearest_swing_price=level.price,
            explanation=explanation,
            _level_key=level_key,
        )
        sweep.lifecycle_events.append({
            "status": SweepStatus.ACTIVE.value,
            "at": bar.open_time.isoformat(),
            "index": index,
        })

        if self.sweep_mode == "wick" and rejected:
            self._evaluate_confirmation(
                sweep, bar, index, atr, ms, active_obs, active_fvgs, rejection, pen_depth,
            )
            if sweep.status == SweepStatus.CONFIRMED:
                sweep.confirmed_at = bar.open_time
                sweep.lifecycle_events.append({
                    "status": SweepStatus.CONFIRMED.value,
                    "at": bar.open_time.isoformat(),
                    "index": index,
                })

        return sweep

    def _update_sweep(
        self,
        sweep: LiquiditySweep,
        bar: CandleBar,
        index: int,
        atr: float,
        ms: BarStructureState,
        active_obs: list[OrderBlock],
        active_fvgs: list[FairValueGap],
    ) -> None:
        if sweep.status != SweepStatus.ACTIVE:
            if sweep.status == SweepStatus.CONFIRMED and index - sweep.created_index > self.max_lookback:
                sweep.status = SweepStatus.INVALIDATED
                sweep.invalidated_at = bar.open_time
                sweep.lifecycle_events.append({
                    "status": SweepStatus.INVALIDATED.value,
                    "at": bar.open_time.isoformat(),
                    "index": index,
                    "reason": "expired",
                })
            return

        bars_since = index - sweep.created_index
        if bars_since > self.confirmation_bars:
            sweep.status = SweepStatus.FAILED
            sweep.failed_at = bar.open_time
            sweep.lifecycle_events.append({
                "status": SweepStatus.FAILED.value,
                "at": bar.open_time.isoformat(),
                "index": index,
                "reason": "confirmation_timeout",
            })
            return

        level = sweep.sweep_level
        if sweep.sweep_type == SweepType.SELL_SIDE:
            if bar.close > level + atr * self.min_penetration_atr:
                sweep.status = SweepStatus.FAILED
                sweep.failed_at = bar.open_time
                sweep.lifecycle_events.append({
                    "status": SweepStatus.FAILED.value,
                    "at": bar.open_time.isoformat(),
                    "index": index,
                    "reason": "continuation_above_level",
                })
                return
            rejection = (level - bar.close) / atr if atr > 0 else 0.0
        else:
            if bar.close < level - atr * self.min_penetration_atr:
                sweep.status = SweepStatus.FAILED
                sweep.failed_at = bar.open_time
                sweep.lifecycle_events.append({
                    "status": SweepStatus.FAILED.value,
                    "at": bar.open_time.isoformat(),
                    "index": index,
                    "reason": "continuation_below_level",
                })
                return
            rejection = (bar.close - level) / atr if atr > 0 else 0.0

        pen_depth = sweep.penetration_depth / atr if atr > 0 else sweep.penetration_depth
        self._evaluate_confirmation(
            sweep, bar, index, atr, ms, active_obs, active_fvgs, rejection, pen_depth,
        )
        if sweep.status == SweepStatus.CONFIRMED and sweep.confirmed_at is None:
            sweep.confirmed_at = bar.open_time
            sweep.lifecycle_events.append({
                "status": SweepStatus.CONFIRMED.value,
                "at": bar.open_time.isoformat(),
                "index": index,
            })

    def _evaluate_confirmation(
        self,
        sweep: LiquiditySweep,
        bar: CandleBar,
        index: int,
        atr: float,
        ms: BarStructureState,
        active_obs: list[OrderBlock],
        active_fvgs: list[FairValueGap],
        rejection: float,
        pen_depth: float,
    ) -> None:
        conf = _compute_confirmation(
            sweep, bar, index, atr, ms, active_obs, active_fvgs,
            rejection, pen_depth, self.sm_proximity_atr,
        )
        sweep.confirmation_components = conf
        conf_score = sum(conf.to_dict().values()) / len(conf.to_dict())

        strength = _compute_strength(
            pen_depth, rejection, bar, index, atr, ms, active_obs, active_fvgs,
            self.sm_proximity_atr, self.strength_weights,
        )
        sweep.strength_components = strength
        sweep.strength_score = _weighted_score(strength.to_dict(), self.strength_weights)
        sweep.confidence = min(0.4 + conf_score / 200.0 + sweep.strength_score / 200.0, 1.0)

        if conf_score >= self.confirmation_threshold:
            sweep.status = SweepStatus.CONFIRMED


def _init_session_levels(
    bars: list[CandleBar],
    session_levels: list[dict[str, Any]],
) -> list[LiquidityLevel]:
    levels: list[LiquidityLevel] = []
    for raw in session_levels:
        price = float(raw["price"])
        kind = str(raw.get("type", "session_high"))
        level_type = LevelType.SESSION_HIGH if "high" in kind else LevelType.SESSION_LOW
        levels.append(
            LiquidityLevel(
                price=price,
                level_type=level_type,
                source_index=0,
                created_at=bars[0].open_time if bars else raw.get("created_at"),
            )
        )
    return levels


def _update_liquidity_levels(
    bars: list[CandleBar],
    index: int,
    ms: BarStructureState,
    levels: list[LiquidityLevel],
    atr: float,
    swing_sensitivity: int,
    equal_tol_atr: float,
) -> None:
    tol = atr * equal_tol_atr
    if ms.is_swing_high:
        pivot = index - swing_sensitivity
        if pivot >= 0:
            price = bars[pivot].high
            _add_swing_level(
                levels, price, pivot, bars[pivot].open_time,
                LevelType.SWING_HIGH, LevelType.EQUAL_HIGH, tol,
            )
    if ms.is_swing_low:
        pivot = index - swing_sensitivity
        if pivot >= 0:
            price = bars[pivot].low
            _add_swing_level(
                levels, price, pivot, bars[pivot].open_time,
                LevelType.SWING_LOW, LevelType.EQUAL_LOW, tol,
            )


def _add_swing_level(
    levels: list[LiquidityLevel],
    price: float,
    pivot: int,
    created_at: datetime,
    swing_type: LevelType,
    equal_type: LevelType,
    tol: float,
) -> None:
    equals = [l for l in levels if l.level_type in (swing_type, equal_type) and abs(l.price - price) <= tol]
    if len(equals) >= 1:
        avg = sum(l.price for l in equals) / len(equals)
        levels.append(
            LiquidityLevel(
                price=avg,
                level_type=equal_type,
                source_index=pivot,
                created_at=created_at,
                touch_count=len(equals) + 1,
            )
        )
    levels.append(
        LiquidityLevel(
            price=price,
            level_type=swing_type,
            source_index=pivot,
            created_at=created_at,
        )
    )


def _levels_in_lookback(
    levels: list[LiquidityLevel],
    index: int,
    max_lookback: int,
) -> list[LiquidityLevel]:
    seen: dict[tuple[str, float], LiquidityLevel] = {}
    for lvl in levels:
        if index - lvl.source_index > max_lookback:
            continue
        key = (lvl.level_type.value, round(lvl.price, 6))
        seen[key] = lvl
    return list(seen.values())


def _nearest_sm_context(
    price: float,
    obs: list[OrderBlock],
    fvgs: list[FairValueGap],
    atr: float,
    proximity_atr: float,
) -> tuple[str | None, str | None]:
    ob_id: str | None = None
    fvg_id: str | None = None
    best_ob = float("inf")
    best_fvg = float("inf")

    for block in obs:
        if block.zone_low <= price <= block.zone_high:
            return block.order_block_id, fvg_id
        mid = (block.zone_low + block.zone_high) / 2
        dist = abs(price - mid) / atr if atr > 0 else abs(price - mid)
        if dist < best_ob and dist <= proximity_atr:
            best_ob = dist
            ob_id = block.order_block_id

    for fvg in fvgs:
        if fvg.gap_low <= price <= fvg.gap_high:
            return ob_id, fvg.fvg_id
        mid = (fvg.gap_low + fvg.gap_high) / 2
        dist = abs(price - mid) / atr if atr > 0 else abs(price - mid)
        if dist < best_fvg and dist <= proximity_atr:
            best_fvg = dist
            fvg_id = fvg.fvg_id

    return ob_id, fvg_id


def _compute_confirmation(
    sweep: LiquiditySweep,
    bar: CandleBar,
    index: int,
    atr: float,
    ms: BarStructureState,
    obs: list[OrderBlock],
    fvgs: list[FairValueGap],
    rejection: float,
    pen_depth: float,
    proximity_atr: float,
) -> ConfirmationComponents:
    immediate = min(max(rejection / 2.0, 0.0), 1.0) * 100.0

    vol_score = min(pen_depth * 25.0 + 35.0, 100.0)

    atr_score = min(pen_depth / 2.0, 1.0) * 100.0

    bos_score = 0.0
    if ms.bos:
        if sweep.sweep_type == SweepType.BUY_SIDE and "bullish" in ms.bos.event_type:
            bos_score = 90.0
        elif sweep.sweep_type == SweepType.SELL_SIDE and "bearish" in ms.bos.event_type:
            bos_score = 90.0
        else:
            bos_score = 40.0

    choch_score = 0.0
    if ms.choch:
        if sweep.sweep_type == SweepType.BUY_SIDE and "bullish" in ms.choch.event_type:
            choch_score = 85.0
        elif sweep.sweep_type == SweepType.SELL_SIDE and "bearish" in ms.choch.event_type:
            choch_score = 85.0
        else:
            choch_score = 35.0

    ob_id, fvg_id = _nearest_sm_context(sweep.sweep_level, obs, fvgs, atr, proximity_atr)
    ob_score = 100.0 if ob_id else 0.0
    fvg_score = 100.0 if fvg_id else 0.0

    trend = ms.trend.value
    if sweep.sweep_type == SweepType.BUY_SIDE and trend == "bullish":
        trend_score = 80.0
    elif sweep.sweep_type == SweepType.SELL_SIDE and trend == "bearish":
        trend_score = 80.0
    elif trend == "sideways":
        trend_score = 55.0
    else:
        trend_score = 30.0

    return ConfirmationComponents(
        immediate_rejection=immediate,
        volume_expansion=vol_score,
        atr_expansion=atr_score,
        bos_confirmation=bos_score,
        choch_confirmation=choch_score,
        order_block_proximity=ob_score,
        fvg_proximity=fvg_score,
        trend_alignment=trend_score,
    )


def _compute_strength(
    pen_depth: float,
    rejection: float,
    bar: CandleBar,
    index: int,
    atr: float,
    ms: BarStructureState,
    obs: list[OrderBlock],
    fvgs: list[FairValueGap],
    proximity_atr: float,
    weights: dict[str, float],
) -> StrengthComponents:
    pen_score = min(pen_depth / 2.0, 1.0) * 100.0
    rej_score = min(max(rejection / 2.0, 0.0), 1.0) * 100.0
    vol_score = min(bar.volume / 1000.0, 3.0) / 3.0 * 100.0
    atr_score = min((bar.high - bar.low) / atr / 2.0, 1.0) * 100.0 if atr > 0 else 50.0
    ms_score = ms.confidence * 100.0
    ob_id, fvg_id = _nearest_sm_context(
        (bar.high + bar.low) / 2, obs, fvgs, atr, proximity_atr,
    )
    sm_score = 100.0 if (ob_id or fvg_id) else 20.0

    return StrengthComponents(
        penetration_depth=pen_score,
        rejection_strength=rej_score,
        volume=vol_score,
        atr=atr_score,
        market_structure_context=ms_score,
        smart_money_context=sm_score,
    )


def _weighted_score(components: dict[str, float], weights: dict[str, float]) -> float:
    total = sum(components.get(k, 0.0) * weights.get(k, 0.0) for k in weights)
    weight_sum = sum(weights.values()) or 1.0
    return round(min(max(total / weight_sum, 0.0), 100.0), 2)


def _event_dict(event: StructureEvent | None) -> dict[str, Any] | None:
    if event is None:
        return None
    return {
        "type": event.event_type,
        "broken_swing_price": round(event.broken_swing_price, 8),
        "break_price": round(event.break_price, 8),
        "break_index": event.break_index,
    }
