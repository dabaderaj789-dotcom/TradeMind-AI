"""Pullback setup detector."""

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


class PullbackDetector(SetupDetector):
    @property
    def setup_type_id(self) -> str:
        return SetupType.PULLBACK.value

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
        mitigated_key = f"mitigated_order_block_{direction.value}"
        filled_key = f"filled_fvg_{direction.value}"

        if directional.get(mitigated_key, 0) < 35 and directional.get(filled_key, 0) < 35:
            return None

        atr = ctx.atr or max(ctx.high - ctx.low, 1e-6)
        entry, stop, targets = derive_zones(ctx, direction, atr=atr)

        ref_ids: dict[str, str | None] = {}
        for block in ctx.order_blocks.get("active_order_blocks") or []:
            if str(block.get("type")) == direction.value:
                ref_ids["order_block_id"] = block.get("order_block_id")

        return TradeSetupCandidate(
            setup_type=SetupType.PULLBACK,
            direction=direction,
            evidence_scores=directional,
            entry_zone=entry,
            stop_loss_zone=stop,
            target_zones=targets,
            explanation=(
                f"Pullback {direction.value}: price retesting mitigated SMC zone within "
                f"{trend} trend structure"
            ),
            detected_at=ctx.open_time,
            detected_index=ctx.bar_index,
            reference_ids=ref_ids,
        )
