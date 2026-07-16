"""Reversal setup detector."""

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


class ReversalDetector(SetupDetector):
    @property
    def setup_type_id(self) -> str:
        return SetupType.REVERSAL.value

    def detect(
        self,
        ctx: BarAnalysisContext,
        evidence: dict[str, float],
    ) -> TradeSetupCandidate | None:
        choch = ctx.market_structure.get("choch")
        if not choch:
            return None

        choch_type = str(choch.get("type", ""))
        if "bullish" in choch_type:
            direction = SetupDirection.BULLISH
            sweep_key = "liquidity_sweep_buy_side"
        elif "bearish" in choch_type:
            direction = SetupDirection.BEARISH
            sweep_key = "liquidity_sweep_sell_side"
        else:
            return None

        directional = evidence_for_direction(evidence, direction)
        choch_key = f"choch_{direction.value}"
        if directional.get(choch_key, 0) < 60:
            return None
        if directional.get(sweep_key, 0) < 40:
            return None

        atr = ctx.atr or max(ctx.high - ctx.low, 1e-6)
        entry, stop, targets = derive_zones(ctx, direction, atr=atr)

        sweep_id = None
        for sweep in (ctx.liquidity_sweeps.get("new_sweeps") or []):
            if str(sweep.get("status")) in ("active", "confirmed"):
                sweep_id = sweep.get("sweep_id")
                break

        return TradeSetupCandidate(
            setup_type=SetupType.REVERSAL,
            direction=direction,
            evidence_scores=directional,
            entry_zone=entry,
            stop_loss_zone=stop,
            target_zones=targets,
            explanation=(
                f"Reversal {direction.value}: CHoCH with confirmed liquidity sweep "
                f"suggesting institutional reversal"
            ),
            detected_at=ctx.open_time,
            detected_index=ctx.bar_index,
            reference_ids={"sweep_id": sweep_id, "choch_type": choch_type},
        )
