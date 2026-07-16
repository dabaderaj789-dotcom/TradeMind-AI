"""Confidence scoring from evidence."""

from __future__ import annotations

from app.engines.trade_setup.types import (
    ConfidenceLevel,
    ScoredTradeSetup,
    SetupDirection,
    TradeSetupCandidate,
    confidence_level_from_score,
    new_setup_id,
)


DEFAULT_EVIDENCE_WEIGHTS: dict[str, float] = {
    "bullish_bos": 1.2,
    "bearish_bos": 1.2,
    "choch_bullish": 1.1,
    "choch_bearish": 1.1,
    "fresh_order_block_bullish": 1.0,
    "fresh_order_block_bearish": 1.0,
    "mitigated_order_block_bullish": 0.8,
    "mitigated_order_block_bearish": 0.8,
    "open_fvg_bullish": 0.9,
    "open_fvg_bearish": 0.9,
    "filled_fvg_bullish": 0.7,
    "filled_fvg_bearish": 0.7,
    "liquidity_sweep_buy_side": 1.1,
    "liquidity_sweep_sell_side": 1.1,
    "trend_alignment_bullish": 1.0,
    "trend_alignment_bearish": 1.0,
    "range_context": 0.9,
    "market_structure_confidence": 0.8,
    "rsi_oversold": 0.6,
    "rsi_overbought": 0.6,
    "rsi_neutral": 0.3,
    "vwap_above": 0.5,
    "vwap_below": 0.5,
    "volume_confirmation": 0.7,
}


def score_candidate(
    candidate: TradeSetupCandidate,
    *,
    weights: dict[str, float],
    min_confidence: float,
    expiration_bars: int,
) -> ScoredTradeSetup | None:
    weighted_sum = 0.0
    weight_total = 0.0
    breakdown: dict[str, float] = {}

    for key, raw_score in candidate.evidence_scores.items():
        w = weights.get(key, 0.5)
        contribution = raw_score * w
        breakdown[key] = round(contribution, 2)
        weighted_sum += contribution
        weight_total += w * 100.0

    if weight_total <= 0:
        return None

    confidence = round(min(max(weighted_sum / weight_total * 100.0, 0.0), 100.0), 2)
    if confidence < min_confidence:
        return None

    return ScoredTradeSetup(
        setup_id=new_setup_id(),
        setup_type=candidate.setup_type,
        direction=candidate.direction,
        confidence_score=confidence,
        confidence_level=confidence_level_from_score(confidence),
        evidence_scores=breakdown,
        entry_zone=candidate.entry_zone,
        stop_loss_zone=candidate.stop_loss_zone,
        target_zones=candidate.target_zones,
        risk_reward=candidate.risk_reward,
        explanation=candidate.explanation,
        detected_at=candidate.detected_at,
        detected_index=candidate.detected_index,
        expires_index=candidate.detected_index + expiration_bars,
        reference_ids=candidate.reference_ids,
    )
