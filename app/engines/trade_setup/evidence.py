"""Evidence extraction from aligned plugin outputs."""

from __future__ import annotations

from app.engines.trade_setup.types import BarAnalysisContext, SetupDirection


def extract_evidence(ctx: BarAnalysisContext) -> dict[str, float]:
    """Return evidence contributor scores (0–100) for a single bar."""
    scores: dict[str, float] = {}
    ms = ctx.market_structure

    trend = str(ms.get("trend", "sideways"))
    if trend == "bullish":
        scores["trend_alignment_bullish"] = 85.0
        scores["trend_alignment_bearish"] = 20.0
    elif trend == "bearish":
        scores["trend_alignment_bearish"] = 85.0
        scores["trend_alignment_bullish"] = 20.0
    else:
        scores["trend_alignment_bullish"] = 45.0
        scores["trend_alignment_bearish"] = 45.0
        scores["range_context"] = 80.0

    phase = str(ms.get("market_phase", "ranging"))
    if phase == "ranging":
        scores["range_context"] = 90.0
    scores["market_structure_confidence"] = float(ms.get("confidence", 0)) * 100.0

    bos = ms.get("bos")
    if bos:
        bos_type = str(bos.get("type", ""))
        if "bullish" in bos_type:
            scores["bullish_bos"] = 90.0
        if "bearish" in bos_type:
            scores["bearish_bos"] = 90.0

    choch = ms.get("choch")
    if choch:
        choch_type = str(choch.get("type", ""))
        if "bullish" in choch_type:
            scores["choch_bullish"] = 88.0
        if "bearish" in choch_type:
            scores["choch_bearish"] = 88.0

    _score_order_blocks(ctx, scores)
    _score_fvgs(ctx, scores)
    _score_sweeps(ctx, scores)
    _score_indicators(ctx, scores)

    return scores


def _score_order_blocks(ctx: BarAnalysisContext, scores: dict[str, float]) -> None:
    ob = ctx.order_blocks
    for block in ob.get("active_order_blocks") or []:
        btype = str(block.get("type", ""))
        status = str(block.get("status", ""))
        mitigation = str(block.get("mitigation_state", ""))
        strength = float(block.get("strength_score", 0))

        if btype == "bullish" and status == "fresh":
            scores["fresh_order_block_bullish"] = max(scores.get("fresh_order_block_bullish", 0), strength)
        if btype == "bearish" and status == "fresh":
            scores["fresh_order_block_bearish"] = max(scores.get("fresh_order_block_bearish", 0), strength)
        if mitigation in ("partially_mitigated", "fully_mitigated", "first_touch"):
            key = f"mitigated_order_block_{btype}"
            scores[key] = max(scores.get(key, 0), strength * 0.85)


def _score_fvgs(ctx: BarAnalysisContext, scores: dict[str, float]) -> None:
    fvg = ctx.fair_value_gaps
    for gap in fvg.get("active_fvgs") or []:
        gtype = str(gap.get("type", ""))
        fill_state = str(gap.get("fill_state", "open"))
        quality = float(gap.get("quality_score", 0))
        if fill_state == "open":
            key = f"open_fvg_{gtype}"
            scores[key] = max(scores.get(key, 0), quality)
        elif fill_state in ("partially_filled", "fully_filled"):
            key = f"filled_fvg_{gtype}"
            scores[key] = max(scores.get(key, 0), quality * 0.8)


def _score_sweeps(ctx: BarAnalysisContext, scores: dict[str, float]) -> None:
    ls = ctx.liquidity_sweeps
    for sweep in (ls.get("new_sweeps") or []) + (ls.get("active_sweeps") or []):
        stype = str(sweep.get("type", ""))
        status = str(sweep.get("status", ""))
        strength = float(sweep.get("strength_score", 0))
        if status in ("active", "confirmed"):
            if stype == "buy_side":
                scores["liquidity_sweep_buy_side"] = max(
                    scores.get("liquidity_sweep_buy_side", 0), strength,
                )
            if stype == "sell_side":
                scores["liquidity_sweep_sell_side"] = max(
                    scores.get("liquidity_sweep_sell_side", 0), strength,
                )


def _score_indicators(ctx: BarAnalysisContext, scores: dict[str, float]) -> None:
    if ctx.rsi is not None:
        if ctx.rsi <= 35:
            scores["rsi_oversold"] = min((35 - ctx.rsi) / 35 * 100, 100)
        elif ctx.rsi >= 65:
            scores["rsi_overbought"] = min((ctx.rsi - 65) / 35 * 100, 100)
        else:
            scores["rsi_neutral"] = 60.0

    if ctx.vwap is not None:
        if ctx.close > ctx.vwap:
            scores["vwap_above"] = min(abs(ctx.close - ctx.vwap) / ctx.vwap * 1000, 100)
        elif ctx.close < ctx.vwap:
            scores["vwap_below"] = min(abs(ctx.close - ctx.vwap) / ctx.vwap * 1000, 100)

    if ctx.atr is not None and ctx.volume > 0:
        scores["volume_confirmation"] = min(ctx.volume / 1000.0, 3.0) / 3.0 * 70.0


def evidence_for_direction(
    evidence: dict[str, float],
    direction: SetupDirection,
) -> dict[str, float]:
    """Filter evidence relevant to setup direction."""
    bullish_keys = {
        "trend_alignment_bullish", "bullish_bos", "choch_bullish",
        "fresh_order_block_bullish", "mitigated_order_block_bullish",
        "open_fvg_bullish", "filled_fvg_bullish", "liquidity_sweep_buy_side",
        "rsi_oversold", "vwap_below",
    }
    bearish_keys = {
        "trend_alignment_bearish", "bearish_bos", "choch_bearish",
        "fresh_order_block_bearish", "mitigated_order_block_bearish",
        "open_fvg_bearish", "filled_fvg_bearish", "liquidity_sweep_sell_side",
        "rsi_overbought", "vwap_above",
    }
    shared = {
        "market_structure_confidence", "range_context", "rsi_neutral",
        "volume_confirmation",
    }
    keys = bullish_keys | shared if direction == SetupDirection.BULLISH else bearish_keys | shared
    return {k: v for k, v in evidence.items() if k in keys and v > 0}
