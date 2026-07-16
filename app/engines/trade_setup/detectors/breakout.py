"""Breakout setup detector."""

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


class BreakoutDetector(SetupDetector):
    @property
    def setup_type_id(self) -> str:
        return SetupType.BREAKOUT.value

    def detect(
        self,
        ctx: BarAnalysisContext,
        evidence: dict[str, float],
    ) -> TradeSetupCandidate | None:
        bos = ctx.market_structure.get("bos")
        if not bos:
            return None

        bos_type = str(bos.get("type", ""))
        if "bullish" in bos_type:
            direction = SetupDirection.BULLISH
        elif "bearish" in bos_type:
            direction = SetupDirection.BEARISH
        else:
            return None

        directional = evidence_for_direction(evidence, direction)
        bos_key = "bullish_bos" if direction == SetupDirection.BULLISH else "bearish_bos"
        if directional.get(bos_key, 0) < 70:
            return None

        has_confluence = (
            directional.get(f"fresh_order_block_{direction.value}", 0) > 30
            or directional.get(f"open_fvg_{direction.value}", 0) > 30
            or directional.get("volume_confirmation", 0) > 40
        )
        if not has_confluence:
            return None

        atr = ctx.atr or max(ctx.high - ctx.low, 1e-6)
        entry, stop, targets = derive_zones(ctx, direction, atr=atr)

        return TradeSetupCandidate(
            setup_type=SetupType.BREAKOUT,
            direction=direction,
            evidence_scores=directional,
            entry_zone=entry,
            stop_loss_zone=stop,
            target_zones=targets,
            explanation=(
                f"Breakout {direction.value}: confirmed BOS with SMC confluence and "
                f"volume/structure support"
            ),
            detected_at=ctx.open_time,
            detected_index=ctx.bar_index,
            reference_ids={"bos_break_index": str(bos.get("break_index", ""))},
        )
