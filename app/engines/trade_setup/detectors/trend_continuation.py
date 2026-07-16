"""Trend continuation setup detector."""

from __future__ import annotations

from app.engines.trade_setup.detectors.base import SetupDetector
from app.engines.trade_setup.evidence import evidence_for_direction
from app.engines.trade_setup.types import (
    BarAnalysisContext,
    SetupDirection,
    SetupType,
    TradeSetupCandidate,
)
from app.engines.trade_setup.zones import derive_zones


class TrendContinuationDetector(SetupDetector):
    @property
    def setup_type_id(self) -> str:
        return SetupType.TREND_CONTINUATION.value

    def detect(
        self,
        ctx: BarAnalysisContext,
        evidence: dict[str, float],
    ) -> TradeSetupCandidate | None:
        trend = str(ctx.market_structure.get("trend", "sideways"))
        if trend == "bullish":
            direction = SetupDirection.BULLISH
        elif trend == "bearish":
            direction = SetupDirection.BEARISH
        else:
            return None

        directional = evidence_for_direction(evidence, direction)
        trend_key = (
            "trend_alignment_bullish"
            if direction == SetupDirection.BULLISH
            else "trend_alignment_bearish"
        )
        if directional.get(trend_key, 0) < 70:
            return None

        has_zone = (
            directional.get(f"fresh_order_block_{direction.value}", 0) > 40
            or directional.get(f"open_fvg_{direction.value}", 0) > 40
            or directional.get(f"mitigated_order_block_{direction.value}", 0) > 30
        )
        if not has_zone:
            return None

        atr = ctx.atr or max(ctx.high - ctx.low, 1e-6)
        entry, stop, targets = derive_zones(ctx, direction, atr=atr)

        return TradeSetupCandidate(
            setup_type=SetupType.TREND_CONTINUATION,
            direction=direction,
            evidence_scores=directional,
            entry_zone=entry,
            stop_loss_zone=stop,
            target_zones=targets,
            explanation=(
                f"Trend continuation {direction.value}: established {trend} trend with "
                f"pullback into {entry.label} zone for potential continuation"
            ),
            detected_at=ctx.open_time,
            detected_index=ctx.bar_index,
        )
