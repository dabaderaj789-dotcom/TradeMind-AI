"""Extract replay events from aligned analysis data."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.engines.replay_studio.types import (
    ReplayCandle,
    ReplayEvent,
    ReplayEventType,
    StrategyDecisionSnapshot,
    TradeSetupSnapshot,
    new_event_id,
)


def extract_events(
    candles: list[ReplayCandle],
    analysis_by_plugin: dict[str, dict[datetime, dict[str, Any]]],
    trade_setups: list[TradeSetupSnapshot],
    strategy_decisions: list[StrategyDecisionSnapshot],
) -> list[ReplayEvent]:
    events: list[ReplayEvent] = []
    time_to_index = {c.open_time: i for i, c in enumerate(candles)}
    ms_bars = analysis_by_plugin.get("market_structure", {})

    for open_time, values in ms_bars.items():
        idx = time_to_index.get(open_time)
        if idx is None:
            continue
        if values.get("is_swing_high"):
            events.append(
                ReplayEvent(
                    event_id=new_event_id(),
                    event_type=ReplayEventType.SWING_HIGH.value,
                    bar_index=idx,
                    open_time=open_time,
                    label=f"Swing High ({values.get('swing_type', 'SH')})",
                    price=candles[idx].high,
                    metadata={"swing_type": values.get("swing_type")},
                )
            )
        if values.get("is_swing_low"):
            events.append(
                ReplayEvent(
                    event_id=new_event_id(),
                    event_type=ReplayEventType.SWING_LOW.value,
                    bar_index=idx,
                    open_time=open_time,
                    label=f"Swing Low ({values.get('swing_type', 'SL')})",
                    price=candles[idx].low,
                    metadata={"swing_type": values.get("swing_type")},
                )
            )
        bos = values.get("bos")
        if bos:
            events.append(
                ReplayEvent(
                    event_id=new_event_id(),
                    event_type=ReplayEventType.BOS.value,
                    bar_index=idx,
                    open_time=open_time,
                    label=f"BOS {bos.get('type', '')}",
                    direction="bullish" if "bullish" in str(bos.get("type", "")) else "bearish",
                    price=bos.get("break_price"),
                    metadata=bos if isinstance(bos, dict) else {},
                )
            )
        choch = values.get("choch")
        if choch:
            events.append(
                ReplayEvent(
                    event_id=new_event_id(),
                    event_type=ReplayEventType.CHOCH.value,
                    bar_index=idx,
                    open_time=open_time,
                    label=f"CHoCH {choch.get('type', '')}",
                    direction="bullish" if "bullish" in str(choch.get("type", "")) else "bearish",
                    price=choch.get("break_price"),
                    metadata=choch if isinstance(choch, dict) else {},
                )
            )

    ob_bars = analysis_by_plugin.get("order_blocks", {})
    for open_time, values in ob_bars.items():
        idx = time_to_index.get(open_time)
        if idx is None:
            continue
        for ob in values.get("new_order_blocks", []) or []:
            events.append(
                ReplayEvent(
                    event_id=new_event_id(),
                    event_type=ReplayEventType.ORDER_BLOCK.value,
                    bar_index=idx,
                    open_time=open_time,
                    label=f"OB {ob.get('type', '')} ({ob.get('status', '')})",
                    direction=ob.get("type"),
                    price=ob.get("zone_high"),
                    metadata=ob if isinstance(ob, dict) else {},
                )
            )

    fvg_bars = analysis_by_plugin.get("fair_value_gaps", {})
    for open_time, values in fvg_bars.items():
        idx = time_to_index.get(open_time)
        if idx is None:
            continue
        for fvg in values.get("new_fvgs", []) or []:
            events.append(
                ReplayEvent(
                    event_id=new_event_id(),
                    event_type=ReplayEventType.FVG.value,
                    bar_index=idx,
                    open_time=open_time,
                    label=f"FVG {fvg.get('type', '')}",
                    direction=fvg.get("type"),
                    price=fvg.get("gap_high"),
                    metadata=fvg if isinstance(fvg, dict) else {},
                )
            )

    ls_bars = analysis_by_plugin.get("liquidity_sweeps", {})
    for open_time, values in ls_bars.items():
        idx = time_to_index.get(open_time)
        if idx is None:
            continue
        for sweep in values.get("new_sweeps", []) or []:
            events.append(
                ReplayEvent(
                    event_id=new_event_id(),
                    event_type=ReplayEventType.LIQUIDITY_SWEEP.value,
                    bar_index=idx,
                    open_time=open_time,
                    label=f"Sweep {sweep.get('type', '')}",
                    direction=sweep.get("type"),
                    price=sweep.get("sweep_level"),
                    metadata=sweep if isinstance(sweep, dict) else {},
                )
            )

    for setup in trade_setups:
        events.append(
            ReplayEvent(
                event_id=new_event_id(),
                event_type=ReplayEventType.TRADE_SETUP.value,
                bar_index=setup.bar_index,
                open_time=setup.detected_at,
                label=f"Setup {setup.setup_type} ({setup.direction})",
                direction=setup.direction,
                price=setup.entry_zone.get("high"),
                metadata={"setup_id": setup.setup_id, "confidence": setup.confidence_score},
            )
        )

    for decision in strategy_decisions:
        events.append(
            ReplayEvent(
                event_id=new_event_id(),
                event_type=ReplayEventType.STRATEGY_DECISION.value,
                bar_index=decision.bar_index,
                open_time=decision.detected_at,
                label=f"Strategy {decision.strategy_id}",
                direction=decision.direction,
                price=decision.entry_zone.get("high"),
                metadata={
                    "plan_id": decision.plan_id,
                    "setup_id": decision.setup_id,
                    "confidence": decision.strategy_confidence,
                },
            )
        )

    events.sort(key=lambda e: (e.bar_index, e.event_type))
    return events
