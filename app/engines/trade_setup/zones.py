"""Entry, stop, and target zone derivation."""

from __future__ import annotations

from app.engines.trade_setup.types import BarAnalysisContext, PriceZone, SetupDirection


def derive_zones(
    ctx: BarAnalysisContext,
    direction: SetupDirection,
    *,
    atr: float,
) -> tuple[PriceZone, PriceZone, list[PriceZone]]:
    entry = _entry_zone(ctx, direction)
    stop = _stop_zone(ctx, direction, entry, atr)
    targets = _target_zones(entry, stop, direction, ctx, atr)
    return entry, stop, targets


def _entry_zone(ctx: BarAnalysisContext, direction: SetupDirection) -> PriceZone:
    ob_key = "bullish" if direction == SetupDirection.BULLISH else "bearish"
    fvg_key = ob_key

    for block in ctx.order_blocks.get("active_order_blocks") or []:
        if str(block.get("type")) == ob_key:
            return PriceZone(
                high=float(block["zone_high"]),
                low=float(block["zone_low"]),
                label="order_block",
            )

    for gap in ctx.fair_value_gaps.get("active_fvgs") or []:
        if str(gap.get("type")) == fvg_key and str(gap.get("fill_state", "open")) == "open":
            return PriceZone(
                high=float(gap["gap_high"]),
                low=float(gap["gap_low"]),
                label="fair_value_gap",
            )

    mid = ctx.close
    pad = (ctx.atr or (ctx.high - ctx.low)) * 0.25
    if direction == SetupDirection.BULLISH:
        return PriceZone(high=mid, low=mid - pad, label="price_retest")
    return PriceZone(high=mid + pad, low=mid, label="price_retest")


def _stop_zone(
    ctx: BarAnalysisContext,
    direction: SetupDirection,
    entry: PriceZone,
    atr: float,
) -> PriceZone:
    buffer = atr * 0.5
    if direction == SetupDirection.BULLISH:
        low = entry.low - buffer
        sweep_lows = [
            float(s.get("sweep_level", entry.low))
            for s in (ctx.liquidity_sweeps.get("active_sweeps") or [])
            if str(s.get("type")) == "buy_side"
        ]
        if sweep_lows:
            low = min(low, min(sweep_lows) - buffer)
        return PriceZone(high=entry.low, low=low, label="stop_loss")

    high = entry.high + buffer
    sweep_highs = [
        float(s.get("sweep_level", entry.high))
        for s in (ctx.liquidity_sweeps.get("active_sweeps") or [])
        if str(s.get("type")) == "sell_side"
    ]
    if sweep_highs:
        high = max(high, max(sweep_highs) + buffer)
    return PriceZone(high=high, low=entry.high, label="stop_loss")


def _target_zones(
    entry: PriceZone,
    stop: PriceZone,
    direction: SetupDirection,
    ctx: BarAnalysisContext,
    atr: float,
) -> list[PriceZone]:
    entry_mid = (entry.high + entry.low) / 2
    stop_mid = (stop.high + stop.low) / 2
    risk = abs(entry_mid - stop_mid) or atr

    if direction == SetupDirection.BULLISH:
        t1_low = entry_mid + risk
        t1_high = t1_low + atr * 0.25
        t2_low = entry_mid + risk * 2
        t2_high = t2_low + atr * 0.25
        levels = ctx.market_structure.get("resistance_levels") or []
        if levels:
            nearest = min(
                (float(l["price"]) for l in levels if float(l["price"]) > entry_mid),
                default=t2_high,
            )
            t2_high = nearest
            t2_low = nearest - atr * 0.1
    else:
        t1_high = entry_mid - risk
        t1_low = t1_high - atr * 0.25
        t2_high = entry_mid - risk * 2
        t2_low = t2_high - atr * 0.25
        levels = ctx.market_structure.get("support_levels") or []
        if levels:
            nearest = max(
                (float(l["price"]) for l in levels if float(l["price"]) < entry_mid),
                default=t2_low,
            )
            t2_low = nearest
            t2_high = nearest + atr * 0.1

    return [
        PriceZone(high=t1_high, low=t1_low, label="target_1"),
        PriceZone(high=t2_high, low=t2_low, label="target_2"),
    ]
