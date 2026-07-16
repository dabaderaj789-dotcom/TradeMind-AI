"""Build chart overlay payloads up to the current replay index (no future data)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.engines.replay_studio.types import (
    ReplayCandle,
    ReplaySession,
    StrategyDecisionSnapshot,
    TradeSetupSnapshot,
)


def _visible_times(candles: list[ReplayCandle], current_index: int) -> list[datetime]:
    end = min(current_index, len(candles) - 1)
    if end < 0:
        return []
    return [c.open_time for c in candles[: end + 1]]


def _line_points(
    candles: list[ReplayCandle],
    analysis: dict[datetime, dict[str, Any]],
    value_key: str,
    *,
    nested: str | None = None,
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for candle in candles:
        values = analysis.get(candle.open_time, {})
        if nested:
            values = values.get(nested, {}) if isinstance(values.get(nested), dict) else {}
        val = values.get(value_key)
        if val is not None:
            points.append({"time": int(candle.open_time.timestamp()), "value": float(val)})
    return points


def build_overlays(
    session: ReplaySession,
    current_index: int,
    enabled: set[str] | None = None,
) -> dict[str, Any]:
    """Return overlay series visible up to current_index only."""
    enabled = enabled or _default_enabled()
    candles = session.candles[: current_index + 1] if current_index >= 0 else []
    if not candles:
        return {}

    overlays: dict[str, Any] = {}
    analysis = session.analysis_by_plugin

    if "ema" in enabled and "ema" in analysis:
        overlays["ema"] = _line_points(candles, analysis["ema"], "ema")

    if "sma" in enabled and "sma" in analysis:
        overlays["sma"] = _line_points(candles, analysis["sma"], "sma")

    if "vwap" in enabled and "vwap" in analysis:
        overlays["vwap"] = _line_points(candles, analysis["vwap"], "vwap")

    if "atr" in enabled and "atr" in analysis:
        overlays["atr"] = _line_points(candles, analysis["atr"], "atr")

    if "rsi" in enabled and "rsi" in analysis:
        overlays["rsi"] = _line_points(candles, analysis["rsi"], "rsi")

    if "macd" in enabled and "macd" in analysis:
        overlays["macd"] = {
            "macd": _line_points(candles, analysis["macd"], "macd"),
            "signal": _line_points(candles, analysis["macd"], "signal"),
            "histogram": _line_points(candles, analysis["macd"], "histogram"),
        }

    if "market_structure" in enabled and "market_structure" in analysis:
        overlays["market_structure"] = _build_market_structure_overlay(
            candles, analysis["market_structure"],
        )

    if "order_blocks" in enabled and "order_blocks" in analysis:
        overlays["order_blocks"] = _build_zone_overlay(
            candles, analysis["order_blocks"], "active_order_blocks", "zone_high", "zone_low",
        )

    if "fair_value_gaps" in enabled and "fair_value_gaps" in analysis:
        overlays["fair_value_gaps"] = _build_zone_overlay(
            candles, analysis["fair_value_gaps"], "active_fvgs", "gap_high", "gap_low",
        )

    if "liquidity_sweeps" in enabled and "liquidity_sweeps" in analysis:
        overlays["liquidity_sweeps"] = _build_sweep_overlay(
            candles, analysis["liquidity_sweeps"],
        )

    if "trade_setups" in enabled:
        overlays["trade_setups"] = _build_setup_overlay(
            session.trade_setups, current_index,
        )

    if "strategy_decisions" in enabled:
        overlays["strategy_decisions"] = _build_strategy_overlay(
            session.strategy_decisions, current_index,
        )

    return overlays


def _default_enabled() -> set[str]:
    return {
        "ema", "sma", "rsi", "macd", "atr", "vwap",
        "market_structure", "order_blocks", "fair_value_gaps",
        "liquidity_sweeps", "trade_setups", "strategy_decisions",
    }


def _build_market_structure_overlay(
    candles: list[ReplayCandle],
    ms_analysis: dict[datetime, dict[str, Any]],
) -> dict[str, Any]:
    markers: list[dict[str, Any]] = []
    support_lines: list[dict[str, Any]] = []
    resistance_lines: list[dict[str, Any]] = []

    last_values = ms_analysis.get(candles[-1].open_time, {})
    for level in last_values.get("support_levels", []) or []:
        support_lines.append({
            "price": level.get("price"),
            "strength": level.get("strength"),
            "label": "Support",
        })
    for level in last_values.get("resistance_levels", []) or []:
        resistance_lines.append({
            "price": level.get("price"),
            "strength": level.get("strength"),
            "label": "Resistance",
        })

    for candle in candles:
        values = ms_analysis.get(candle.open_time, {})
        t = int(candle.open_time.timestamp())
        if values.get("is_swing_high"):
            markers.append({
                "time": t, "position": "aboveBar", "shape": "arrowDown",
                "color": "#ef5350", "text": values.get("swing_type", "SH"),
            })
        if values.get("is_swing_low"):
            markers.append({
                "time": t, "position": "belowBar", "shape": "arrowUp",
                "color": "#26a69a", "text": values.get("swing_type", "SL"),
            })
        bos = values.get("bos")
        if bos:
            markers.append({
                "time": t, "position": "aboveBar", "shape": "circle",
                "color": "#2196f3", "text": "BOS",
            })
        choch = values.get("choch")
        if choch:
            markers.append({
                "time": t, "position": "belowBar", "shape": "circle",
                "color": "#ff9800", "text": "CHoCH",
            })

    return {
        "markers": markers,
        "support_levels": support_lines,
        "resistance_levels": resistance_lines,
        "trend": last_values.get("trend"),
        "market_phase": last_values.get("market_phase"),
    }


def _build_zone_overlay(
    candles: list[ReplayCandle],
    plugin_analysis: dict[datetime, dict[str, Any]],
    list_key: str,
    high_key: str,
    low_key: str,
) -> list[dict[str, Any]]:
    if not candles:
        return []
    last_values = plugin_analysis.get(candles[-1].open_time, {})
    zones: list[dict[str, Any]] = []
    for item in last_values.get(list_key, []) or []:
        zones.append({
            "id": item.get("order_block_id") or item.get("fvg_id") or item.get("sweep_id"),
            "type": item.get("type"),
            "high": item.get(high_key),
            "low": item.get(low_key),
            "status": item.get("status"),
            "confidence": item.get("confidence"),
        })
    return zones


def _build_sweep_overlay(
    candles: list[ReplayCandle],
    ls_analysis: dict[datetime, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not candles:
        return []
    last_values = ls_analysis.get(candles[-1].open_time, {})
    sweeps: list[dict[str, Any]] = []
    for sweep in last_values.get("active_sweeps", []) or []:
        sweeps.append({
            "id": sweep.get("sweep_id"),
            "type": sweep.get("type"),
            "level": sweep.get("sweep_level"),
            "status": sweep.get("status"),
            "strength_score": sweep.get("strength_score"),
        })
    return sweeps


def _build_setup_overlay(
    setups: list[TradeSetupSnapshot],
    current_index: int,
) -> list[dict[str, Any]]:
    visible: list[dict[str, Any]] = []
    for setup in setups:
        if setup.bar_index <= current_index:
            visible.append({
                "setup_id": setup.setup_id,
                "setup_type": setup.setup_type,
                "direction": setup.direction,
                "bar_index": setup.bar_index,
                "entry_zone": setup.entry_zone,
                "stop_loss_zone": setup.stop_loss_zone,
                "target_zones": setup.target_zones,
                "confidence_score": setup.confidence_score,
            })
    return visible


def _build_strategy_overlay(
    decisions: list[StrategyDecisionSnapshot],
    current_index: int,
) -> list[dict[str, Any]]:
    visible: list[dict[str, Any]] = []
    for d in decisions:
        if d.bar_index <= current_index:
            visible.append(d.to_dict())
    return visible
