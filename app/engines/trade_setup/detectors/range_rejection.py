"""Range rejection setup detector."""

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


class RangeRejectionDetector(SetupDetector):
    @property
    def setup_type_id(self) -> str:
        return SetupType.RANGE_REJECTION.value

    def detect(
        self,
        ctx: BarAnalysisContext,
        evidence: dict[str, float],
    ) -> TradeSetupCandidate | None:
        phase = str(ctx.market_structure.get("market_phase", ""))
        trend = str(ctx.market_structure.get("trend", "sideways"))
        if phase not in ("ranging", "accumulation", "distribution") and trend != "sideways":
            return None

        if evidence.get("range_context", 0) < 50:
            return None

        buy_sweep = evidence.get("liquidity_sweep_buy_side", 0)
        sell_sweep = evidence.get("liquidity_sweep_sell_side", 0)
        if buy_sweep < 40 and sell_sweep < 40:
            return None

        if buy_sweep >= sell_sweep:
            direction = SetupDirection.BULLISH
        else:
            direction = SetupDirection.BEARISH

        directional = evidence_for_direction(evidence, direction)
        atr = ctx.atr or max(ctx.high - ctx.low, 1e-6)
        entry, stop, targets = derive_zones(ctx, direction, atr=atr)

        return TradeSetupCandidate(
            setup_type=SetupType.RANGE_REJECTION,
            direction=direction,
            evidence_scores=directional,
            entry_zone=entry,
            stop_loss_zone=stop,
            target_zones=targets,
            explanation=(
                f"Range rejection {direction.value}: liquidity sweep at range boundary "
                f"with rejection in {phase} market"
            ),
            detected_at=ctx.open_time,
            detected_index=ctx.bar_index,
        )
