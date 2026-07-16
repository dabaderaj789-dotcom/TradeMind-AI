"""Fair Value Gap detection analyzer."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.engines.analysis.plugins.market_structure.analyzer import (
    MarketStructureAnalyzer,
    _compute_atr,
    deduplicate_candles,
)
from app.engines.analysis.plugins.market_structure.types import BarStructureState, StructureEvent
from app.engines.analysis.plugins.order_blocks.analyzer import OrderBlockAnalyzer
from app.engines.analysis.plugins.order_blocks.types import OrderBlock
from app.engines.analysis.plugins.fair_value_gaps.types import (
    BarFvgState,
    FairValueGap,
    FillState,
    FvgStatus,
    FvgType,
    QualityComponents,
    new_fvg_id,
)
from app.engines.analysis.types import CandleBar


class FairValueGapAnalyzer:
    """Single-pass O(n) FVG engine with Market Structure and Order Block context."""

    def __init__(
        self,
        *,
        timeframe_code: str = "1h",
        gap_mode: str = "wick",
        min_gap_atr_ratio: float = 0.05,
        min_gap_percent: float = 0.01,
        invalidation_mode: str = "close",
        expiration_bars: int = 0,
        swing_sensitivity: int = 2,
        atr_period: int = 14,
        ob_proximity_atr: float = 3.0,
        max_active_fvgs: int = 100,
        quality_weights: dict[str, float] | None = None,
        include_order_blocks: bool = True,
    ) -> None:
        self.timeframe_code = timeframe_code
        self.gap_mode = gap_mode
        self.min_gap_atr_ratio = min_gap_atr_ratio
        self.min_gap_percent = min_gap_percent
        self.invalidation_mode = invalidation_mode
        self.expiration_bars = expiration_bars
        self.swing_sensitivity = swing_sensitivity
        self.atr_period = atr_period
        self.ob_proximity_atr = ob_proximity_atr
        self.max_active_fvgs = max_active_fvgs
        self.include_order_blocks = include_order_blocks
        self.quality_weights = quality_weights or {
            "gap_size_atr": 0.20,
            "impulse_strength": 0.20,
            "volume_expansion": 0.15,
            "structure_alignment": 0.20,
            "order_block_proximity": 0.10,
            "trend_alignment": 0.15,
        }

    def analyze(self, candles: list[CandleBar]) -> list[BarFvgState]:
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
            ob_analyzer = OrderBlockAnalyzer(
                timeframe_code=self.timeframe_code,
                swing_sensitivity=self.swing_sensitivity,
                atr_period=self.atr_period,
            )
            ob_states = ob_analyzer.analyze(bars)

        all_fvgs: list[FairValueGap] = []
        bar_states: list[BarFvgState] = []

        for i in range(n):
            bar = bars[i]
            atr = atrs[i] or (atrs[i - 1] if i > 0 else 1.0) or 1.0
            ms = ms_states[i]

            new_fvgs: list[FairValueGap] = []
            filled_bar: list[FairValueGap] = []
            invalidated_bar: list[FairValueGap] = []

            if i >= 2:
                active_obs = (
                    ob_states[i].active_blocks if ob_states and i < len(ob_states) else []
                )
                created = self._detect_fvg(bars, i, ms, atr, atrs, active_obs)
                if created is not None:
                    all_fvgs.append(created)
                    new_fvgs.append(created)

            for fvg in list(all_fvgs):
                if fvg.status in (FvgStatus.FULLY_FILLED, FvgStatus.INVALIDATED):
                    continue

                prev_status = fvg.status
                self._update_fvg(fvg, bar, index=i, atr=atr)

                if fvg.status == FvgStatus.INVALIDATED:
                    invalidated_bar.append(fvg)
                elif fvg.status == FvgStatus.FULLY_FILLED and prev_status != FvgStatus.FULLY_FILLED:
                    filled_bar.append(fvg)
                elif fvg.status == FvgStatus.PARTIALLY_FILLED and prev_status == FvgStatus.OPEN:
                    filled_bar.append(fvg)

            active = [
                f for f in all_fvgs
                if f.status in (FvgStatus.OPEN, FvgStatus.PARTIALLY_FILLED)
            ]
            if len(active) > self.max_active_fvgs:
                active = active[-self.max_active_fvgs :]

            bar_states.append(
                BarFvgState(
                    active_fvgs=[replace(f) for f in active],
                    new_fvgs=[replace(f) for f in new_fvgs],
                    filled_this_bar=[replace(f) for f in filled_bar],
                    invalidated_this_bar=[replace(f) for f in invalidated_bar],
                )
            )

        return bar_states

    def _detect_fvg(
        self,
        bars: list[CandleBar],
        index: int,
        ms: BarStructureState,
        atr: float,
        atrs: list[float | None],
        active_obs: list[OrderBlock],
    ) -> FairValueGap | None:
        c0, c1, c2 = bars[index - 2], bars[index - 1], bars[index]
        indices = [index - 2, index - 1, index]

        bullish_gap = _bullish_gap_bounds(c0, c2, self.gap_mode)
        bearish_gap = _bearish_gap_bounds(c0, c2, self.gap_mode)

        fvg_type: FvgType | None = None
        gap_low, gap_high = 0.0, 0.0

        if bullish_gap is not None:
            gap_low, gap_high = bullish_gap
            if c1.close > c1.open:
                fvg_type = FvgType.BULLISH
        if bearish_gap is not None and fvg_type is None:
            gap_low, gap_high = bearish_gap
            if c1.close < c1.open:
                fvg_type = FvgType.BEARISH

        if fvg_type is None:
            return None

        gap_size = gap_high - gap_low
        if gap_size <= 0:
            return None

        mid_price = (gap_high + gap_low) / 2.0
        gap_percent = (gap_size / mid_price) * 100.0 if mid_price > 0 else 0.0

        if gap_size < atr * self.min_gap_atr_ratio:
            return None
        if gap_percent < self.min_gap_percent:
            return None

        components = _compute_quality(
            bars, index, fvg_type, gap_size, gap_percent, atr, atrs, ms, active_obs,
            self.ob_proximity_atr, gap_low, gap_high,
        )
        quality = _weighted_quality(components, self.quality_weights)
        ob_id, ob_dist = _nearest_order_block(active_obs, gap_low, gap_high, atr)

        explanation = (
            f"{fvg_type.value.capitalize()} FVG: three-candle imbalance between "
            f"bars {indices[0]}–{indices[2]} ({self.gap_mode} mode), "
            f"gap {gap_size:.4f} ({gap_percent:.3f}%), quality {quality:.1f}"
        )

        confidence = min(0.5 + quality / 200.0 + ms.confidence * 0.3, 1.0)

        return FairValueGap(
            fvg_id=new_fvg_id(),
            fvg_type=fvg_type,
            gap_high=gap_high,
            gap_low=gap_low,
            gap_size=gap_size,
            gap_percent=gap_percent,
            created_at=bars[index].open_time,
            created_index=index,
            source_candle_indices=indices,
            timeframe_code=self.timeframe_code,
            quality_score=quality,
            quality_components=components,
            confidence=round(confidence, 4),
            explanation=explanation,
            trend=ms.trend.value,
            market_phase=ms.market_phase.value,
            associated_bos=_event_dict(ms.bos),
            associated_choch=_event_dict(ms.choch),
            associated_order_block_id=ob_id,
            order_block_distance_atr=ob_dist,
            _filled_low=gap_high,
            _filled_high=gap_low,
        )

    def _update_fvg(self, fvg: FairValueGap, bar: CandleBar, *, index: int, atr: float) -> None:
        if self._check_invalidation(fvg, bar, index):
            return

        if not _overlaps_gap(bar, fvg.gap_low, fvg.gap_high):
            return

        if fvg.first_touch_at is None:
            fvg.first_touch_at = bar.open_time

        overlap_low = max(bar.low, fvg.gap_low)
        overlap_high = min(bar.high, fvg.gap_high)
        if overlap_high > overlap_low:
            fvg._filled_low = min(fvg._filled_low, overlap_low)
            fvg._filled_high = max(fvg._filled_high, overlap_high)

        filled_span = max(fvg._filled_high - fvg._filled_low, 0.0)
        fvg.fill_percentage = min((filled_span / fvg.gap_size) * 100.0, 100.0)

        if fvg.fill_percentage >= 95.0:
            fvg.status = FvgStatus.FULLY_FILLED
            fvg.fill_state = FillState.FULLY_FILLED
            if fvg.full_fill_at is None:
                fvg.full_fill_at = bar.open_time
        elif fvg.fill_percentage > 0:
            fvg.status = FvgStatus.PARTIALLY_FILLED
            fvg.fill_state = FillState.PARTIALLY_FILLED

    def _check_invalidation(self, fvg: FairValueGap, bar: CandleBar, index: int) -> bool:
        if self.expiration_bars > 0 and (index - fvg.created_index) > self.expiration_bars:
            if fvg.status in (FvgStatus.OPEN, FvgStatus.PARTIALLY_FILLED):
                fvg.status = FvgStatus.INVALIDATED
                fvg.invalidation_at = bar.open_time
                fvg.invalidation_reason = f"Expired after {self.expiration_bars} bars"
                return True

        if fvg.status == FvgStatus.FULLY_FILLED:
            return False

        if fvg.fvg_type == FvgType.BULLISH:
            broken = (
                bar.close < fvg.gap_low
                if self.invalidation_mode == "close"
                else bar.low < fvg.gap_low
            )
        else:
            broken = (
                bar.close > fvg.gap_high
                if self.invalidation_mode == "close"
                else bar.high > fvg.gap_high
            )

        if broken:
            fvg.status = FvgStatus.INVALIDATED
            fvg.invalidation_at = bar.open_time
            fvg.invalidation_reason = (
                f"Price {'closed' if self.invalidation_mode == 'close' else 'wicked'} "
                f"through gap boundary"
            )
            return True
        return False


def _bullish_gap_bounds(
    c0: CandleBar, c2: CandleBar, gap_mode: str,
) -> tuple[float, float] | None:
    if gap_mode == "body":
        left = max(c0.open, c0.close)
        right = min(c2.open, c2.close)
    else:
        left = c0.high
        right = c2.low
    if left < right:
        return left, right
    return None


def _bearish_gap_bounds(
    c0: CandleBar, c2: CandleBar, gap_mode: str,
) -> tuple[float, float] | None:
    if gap_mode == "body":
        left = min(c0.open, c0.close)
        right = max(c2.open, c2.close)
    else:
        left = c2.high
        right = c0.low
    if left < right:
        return left, right
    return None


def _overlaps_gap(bar: CandleBar, gap_low: float, gap_high: float) -> bool:
    return bar.low <= gap_high and bar.high >= gap_low


def _event_dict(event: StructureEvent | None) -> dict[str, Any] | None:
    if event is None:
        return None
    return {
        "type": event.event_type,
        "broken_swing_price": round(event.broken_swing_price, 8),
        "break_price": round(event.break_price, 8),
        "break_index": event.break_index,
    }


def _nearest_order_block(
    blocks: list[OrderBlock],
    gap_low: float,
    gap_high: float,
    atr: float,
) -> tuple[str | None, float | None]:
    if not blocks:
        return None, None
    gap_mid = (gap_low + gap_high) / 2.0
    best_id: str | None = None
    best_dist = float("inf")
    for block in blocks:
        if gap_low <= block.zone_high and gap_high >= block.zone_low:
            return block.order_block_id, 0.0
        ob_mid = (block.zone_low + block.zone_high) / 2.0
        dist = abs(gap_mid - ob_mid) / atr if atr > 0 else abs(gap_mid - ob_mid)
        if dist < best_dist:
            best_dist = dist
            best_id = block.order_block_id
    return best_id, round(best_dist, 4) if best_id else None


def _compute_quality(
    bars: list[CandleBar],
    index: int,
    fvg_type: FvgType,
    gap_size: float,
    gap_percent: float,
    atr: float,
    atrs: list[float | None],
    ms: BarStructureState,
    active_obs: list[OrderBlock],
    ob_proximity_atr: float,
    gap_low: float,
    gap_high: float,
) -> QualityComponents:
    impulse_bar = bars[index - 1]
    impulse_body = abs(impulse_bar.close - impulse_bar.open)
    impulse_score = min((impulse_body / atr) / 2.0, 1.0) * 100.0 if atr > 0 else 50.0

    avg_vol = sum(b.volume for b in bars[max(0, index - 20) : index + 1]) / min(index + 1, 21)
    vol_ratio = impulse_bar.volume / avg_vol if avg_vol > 0 else 1.0
    vol_score = min(vol_ratio / 2.0, 1.0) * 100.0

    gap_atr_score = min((gap_size / atr) / 3.0, 1.0) * 100.0 if atr > 0 else min(gap_percent * 10, 100.0)

    structure_score = ms.confidence * 100.0
    if ms.bos:
        bos_type = ms.bos.event_type
        if (fvg_type == FvgType.BULLISH and "bullish" in bos_type) or (
            fvg_type == FvgType.BEARISH and "bearish" in bos_type
        ):
            structure_score = min(structure_score + 25.0, 100.0)
    if ms.choch:
        structure_score = min(structure_score + 10.0, 100.0)

    trend = ms.trend.value
    if (fvg_type == FvgType.BULLISH and trend == "bullish") or (
        fvg_type == FvgType.BEARISH and trend == "bearish"
    ):
        trend_score = 85.0
    elif trend == "sideways":
        trend_score = 50.0
    else:
        trend_score = 25.0

    _, ob_dist = _nearest_order_block(active_obs, gap_low, gap_high, atr)
    if ob_dist is None:
        ob_score = 0.0
    elif ob_dist == 0.0:
        ob_score = 100.0
    else:
        ob_score = max(0.0, (1.0 - ob_dist / ob_proximity_atr) * 100.0)

    return QualityComponents(
        gap_size_atr=gap_atr_score,
        impulse_strength=impulse_score,
        volume_expansion=vol_score,
        structure_alignment=structure_score,
        order_block_proximity=ob_score,
        trend_alignment=trend_score,
    )


def _weighted_quality(components: QualityComponents, weights: dict[str, float]) -> float:
    d = components.to_dict()
    total = sum(d.get(k, 0.0) * weights.get(k, 0.0) for k in weights)
    weight_sum = sum(weights.values()) or 1.0
    return round(min(max(total / weight_sum, 0.0), 100.0), 2)
