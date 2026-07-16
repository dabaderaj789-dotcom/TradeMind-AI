"""Order Block detection analyzer — integrates Market Structure BOS events."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from app.engines.analysis.plugins.market_structure.analyzer import (
    MarketStructureAnalyzer,
    _compute_atr,
    deduplicate_candles,
)
from app.engines.analysis.plugins.market_structure.types import BarStructureState
from app.engines.analysis.plugins.order_blocks.types import (
    BarOrderBlockState,
    MitigationState,
    OrderBlock,
    OrderBlockStatus,
    OrderBlockType,
    StrengthComponents,
    new_order_block_id,
)
from app.engines.analysis.types import CandleBar


class OrderBlockAnalyzer:
    """Single-pass O(n) order block engine using confirmed Market Structure BOS."""

    def __init__(
        self,
        *,
        timeframe_code: str = "1h",
        zone_mode: str = "body",
        invalidation_mode: str = "close",
        cluster_max_bars: int = 3,
        lookback_before_bos: int = 20,
        swing_sensitivity: int = 2,
        atr_period: int = 14,
        strength_weights: dict[str, float] | None = None,
        max_active_blocks: int = 50,
    ) -> None:
        self.timeframe_code = timeframe_code
        self.zone_mode = zone_mode
        self.invalidation_mode = invalidation_mode
        self.cluster_max_bars = max(1, cluster_max_bars)
        self.lookback_before_bos = max(3, lookback_before_bos)
        self.swing_sensitivity = swing_sensitivity
        self.atr_period = atr_period
        self.max_active_blocks = max_active_blocks
        self.strength_weights = strength_weights or {
            "bos_strength": 0.25,
            "volume_ratio": 0.20,
            "atr_expansion": 0.15,
            "impulse_move": 0.20,
            "age_factor": 0.10,
            "reaction_count": 0.10,
        }

    def analyze(self, candles: list[CandleBar]) -> list[BarOrderBlockState]:
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

        all_blocks: list[OrderBlock] = []
        bar_states: list[BarOrderBlockState] = []

        for i in range(n):
            bar = bars[i]
            atr = atrs[i] or (atrs[i - 1] if i > 0 else 1.0) or 1.0
            ms = ms_states[i]

            new_blocks: list[OrderBlock] = []
            mitigated_bar: list[OrderBlock] = []
            invalidated_bar: list[OrderBlock] = []

            if ms.bos is not None:
                created = self._create_from_bos(bars, ms_states, atrs, i, ms)
                if created is not None:
                    all_blocks.append(created)
                    new_blocks.append(created)

            for block in list(all_blocks):
                if block.status == OrderBlockStatus.INVALIDATED:
                    continue

                prev_mitigation = block.mitigation_state
                prev_bar = bars[i - 1] if i > 0 else None
                self._update_block(block, bar, prev_bar, index=i, atr=atr)

                if block.status == OrderBlockStatus.INVALIDATED:
                    invalidated_bar.append(block)
                elif block.mitigation_state != prev_mitigation and block.mitigation_state != MitigationState.UNTOUCHED:
                    mitigated_bar.append(block)

            active = [b for b in all_blocks if b.status != OrderBlockStatus.INVALIDATED]
            active.sort(key=lambda b: b.created_index)
            if len(active) > self.max_active_blocks:
                active = active[-self.max_active_blocks :]

            bar_states.append(
                BarOrderBlockState(
                    active_blocks=[replace(b) for b in active],
                    new_blocks=[replace(b) for b in new_blocks],
                    mitigated_this_bar=[replace(b) for b in mitigated_bar],
                    invalidated_this_bar=[replace(b) for b in invalidated_bar],
                )
            )

        return bar_states

    def _create_from_bos(
        self,
        bars: list[CandleBar],
        ms_states: list[BarStructureState],
        atrs: list[float | None],
        bos_index: int,
        ms: BarStructureState,
    ) -> OrderBlock | None:
        assert ms.bos is not None
        bos = ms.bos

        if bos.event_type == "bos_bullish":
            block_type = OrderBlockType.BULLISH
            cluster = _find_bearish_cluster(bars, bos_index, self.cluster_max_bars, self.lookback_before_bos)
            if not cluster:
                return None
            zone_low, zone_high = _zone_from_cluster(cluster, bars, block_type, self.zone_mode)
            explanation = (
                f"Bullish OB: last bearish cluster (bars {cluster}) before bullish BOS "
                f"breaking swing high {bos.broken_swing_price:.4f} at bar {bos_index}"
            )
        elif bos.event_type == "bos_bearish":
            block_type = OrderBlockType.BEARISH
            cluster = _find_bullish_cluster(bars, bos_index, self.cluster_max_bars, self.lookback_before_bos)
            if not cluster:
                return None
            zone_low, zone_high = _zone_from_cluster(cluster, bars, block_type, self.zone_mode)
            explanation = (
                f"Bearish OB: last bullish cluster (bars {cluster}) before bearish BOS "
                f"breaking swing low {bos.broken_swing_price:.4f} at bar {bos_index}"
            )
        else:
            return None

        if zone_high <= zone_low:
            return None

        atr = atrs[bos_index] or 1.0
        components = _compute_strength_components(
            bars, bos_index, cluster, ms_states[bos_index], atr, atrs, self.atr_period,
        )
        score = _weighted_strength(components, self.strength_weights)
        confidence = min(ms_states[bos_index].confidence + score / 200.0, 1.0)

        return OrderBlock(
            order_block_id=new_order_block_id(),
            block_type=block_type,
            zone_high=zone_high,
            zone_low=zone_low,
            created_at=bars[bos_index].open_time,
            created_index=bos_index,
            source_candle_indices=cluster,
            bos_index=bos_index,
            bos_break_price=bos.break_price,
            bos_broken_swing_price=bos.broken_swing_price,
            timeframe_code=self.timeframe_code,
            strength_score=score,
            strength_components=components,
            confidence=round(confidence, 4),
            explanation=explanation,
        )

    def _update_block(
        self,
        block: OrderBlock,
        bar: CandleBar,
        prev_bar: CandleBar | None,
        *,
        index: int,
        atr: float,
    ) -> None:
        if _is_invalidated(block, bar, mode=self.invalidation_mode):
            block.status = OrderBlockStatus.INVALIDATED
            block.invalidation_at = bar.open_time
            block.invalidation_reason = (
                f"Price {'closed' if self.invalidation_mode == 'close' else 'wicked'} "
                f"beyond opposite side of zone"
            )
            return

        in_zone = _overlaps_zone(bar, block.zone_low, block.zone_high)
        was_in_zone = (
            prev_bar is not None and _overlaps_zone(prev_bar, block.zone_low, block.zone_high)
        )

        if in_zone and not was_in_zone:
            prev_touches = block.touch_count
            block.touch_count += 1
            penetration = _zone_penetration(block, bar)
            event_time = bar.open_time.isoformat()

            if block.touch_count == 1:
                block.mitigation_state = MitigationState.FIRST_TOUCH
                block.mitigation_events.append({"state": "first_touch", "at": event_time, "index": index})
            elif penetration >= 0.85:
                block.mitigation_state = MitigationState.FULLY_MITIGATED
                block.mitigation_events.append({"state": "fully_mitigated", "at": event_time, "index": index})
            else:
                block.mitigation_state = MitigationState.PARTIALLY_MITIGATED
                block.mitigation_events.append({"state": "partially_mitigated", "at": event_time, "index": index})

            if block.mitigation_state != MitigationState.UNTOUCHED:
                block.status = OrderBlockStatus.MITIGATED

            if prev_touches == 0 and _is_reaction(block, bar):
                block.successful_reactions += 1
        elif in_zone and block.mitigation_state == MitigationState.FIRST_TOUCH:
            penetration = _zone_penetration(block, bar)
            if penetration >= 0.85:
                block.mitigation_state = MitigationState.FULLY_MITIGATED
                block.mitigation_events.append({
                    "state": "fully_mitigated",
                    "at": bar.open_time.isoformat(),
                    "index": index,
                })
            elif penetration > 0.35:
                block.mitigation_state = MitigationState.PARTIALLY_MITIGATED

        age_bars = index - block.created_index
        block.strength_components.age_factor = max(0.0, 100.0 - age_bars * 2)
        block.strength_components.reaction_count = min(block.successful_reactions * 25.0, 100.0)
        block.strength_score = _weighted_strength(block.strength_components, self.strength_weights)


def _find_bearish_cluster(
    bars: list[CandleBar], bos_index: int, max_bars: int, lookback: int,
) -> list[int]:
    indices: list[int] = []
    start = max(0, bos_index - lookback)
    for j in range(bos_index - 1, start - 1, -1):
        if bars[j].close < bars[j].open:
            indices.insert(0, j)
            if len(indices) >= max_bars:
                break
        elif indices:
            break
    return indices


def _find_bullish_cluster(
    bars: list[CandleBar], bos_index: int, max_bars: int, lookback: int,
) -> list[int]:
    indices: list[int] = []
    start = max(0, bos_index - lookback)
    for j in range(bos_index - 1, start - 1, -1):
        if bars[j].close > bars[j].open:
            indices.insert(0, j)
            if len(indices) >= max_bars:
                break
        elif indices:
            break
    return indices


def _zone_from_cluster(
    cluster: list[int],
    bars: list[CandleBar],
    block_type: OrderBlockType,
    zone_mode: str,
) -> tuple[float, float]:
    cluster_bars = [bars[i] for i in cluster]
    if block_type == OrderBlockType.BULLISH:
        zone_low = min(b.low for b in cluster_bars)
        if zone_mode == "wick":
            zone_high = max(b.high for b in cluster_bars)
        else:
            zone_high = max(b.open for b in cluster_bars)
    else:
        if zone_mode == "wick":
            zone_low = min(b.low for b in cluster_bars)
        else:
            zone_low = min(b.open for b in cluster_bars)
        zone_high = max(b.high for b in cluster_bars)
    return zone_low, zone_high


def _compute_strength_components(
    bars: list[CandleBar],
    bos_index: int,
    cluster: list[int],
    ms_state: BarStructureState,
    atr: float,
    atrs: list[float | None],
    atr_period: int,
) -> StrengthComponents:
    cluster_vols = [bars[i].volume for i in cluster]
    avg_vol = sum(b.volume for b in bars[max(0, bos_index - 20) : bos_index + 1]) / min(bos_index + 1, 21)
    vol_ratio = (sum(cluster_vols) / len(cluster_vols)) / avg_vol if avg_vol > 0 else 1.0

    prior_atr_idx = max(0, bos_index - atr_period)
    prior_atr = atrs[prior_atr_idx] or atr
    atr_exp = atr / prior_atr if prior_atr > 0 else 1.0

    impulse = 0.0
    if bos_index > 0:
        impulse = abs(bars[bos_index].close - bars[bos_index - 1].close) / atr if atr > 0 else 0.0

    return StrengthComponents(
        bos_strength=ms_state.confidence * 100.0,
        volume_ratio=min(vol_ratio / 2.0, 1.0) * 100.0,
        atr_expansion=min(atr_exp / 2.0, 1.0) * 100.0,
        impulse_move=min(impulse / 2.0, 1.0) * 100.0,
        age_factor=100.0,
        reaction_count=0.0,
    )


def _weighted_strength(components: StrengthComponents, weights: dict[str, float]) -> float:
    d = components.to_dict()
    total = sum(d.get(k, 0.0) * weights.get(k, 0.0) for k in weights)
    weight_sum = sum(weights.values()) or 1.0
    return round(min(max(total / weight_sum, 0.0), 100.0), 2)


def _overlaps_zone(bar: CandleBar, zone_low: float, zone_high: float) -> bool:
    return bar.low <= zone_high and bar.high >= zone_low


def _zone_penetration(block: OrderBlock, bar: CandleBar) -> float:
    overlap_low = max(bar.low, block.zone_low)
    overlap_high = min(bar.high, block.zone_high)
    if overlap_high <= overlap_low:
        return 0.0
    return (overlap_high - overlap_low) / block.zone_depth


def _is_reaction(block: OrderBlock, bar: CandleBar) -> bool:
    if block.block_type == OrderBlockType.BULLISH:
        return bar.close > bar.open and bar.close > block.zone_high
    return bar.close < bar.open and bar.close < block.zone_low


def _is_invalidated(block: OrderBlock, bar: CandleBar, *, mode: str = "close") -> bool:
    if block.block_type == OrderBlockType.BULLISH:
        if mode == "close":
            return bar.close < block.zone_low
        return bar.low < block.zone_low
    if mode == "close":
        return bar.close > block.zone_high
    return bar.high > block.zone_high
