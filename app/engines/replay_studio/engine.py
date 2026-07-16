"""Replay Studio engine — candle-by-candle validation without future reveal."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.engines.replay_studio.events import extract_events
from app.engines.replay_studio.overlays import build_overlays
from app.engines.replay_studio.types import (
    PLUGIN_EXECUTION_ORDER,
    ReplayCandle,
    ReplayEvent,
    ReplayPlaybackState,
    ReplaySession,
    StrategyDecisionSnapshot,
    TradeSetupSnapshot,
)


class ReplayStudioEngine:
    """Controls replay index and builds visible frames."""

    def step_forward(self, session: ReplaySession, steps: int = 1) -> int:
        session.current_index = min(session.current_index + steps, session.total_bars - 1)
        return session.current_index

    def step_back(self, session: ReplaySession, steps: int = 1) -> int:
        session.current_index = max(session.current_index - steps, 0)
        return session.current_index

    def jump_to_index(self, session: ReplaySession, index: int) -> int:
        session.current_index = max(0, min(index, session.total_bars - 1))
        return session.current_index

    def jump_to_date(self, session: ReplaySession, target: datetime) -> int:
        if target.tzinfo is None:
            target = target.replace(tzinfo=UTC)
        best = 0
        for i, candle in enumerate(session.candles):
            ct = candle.open_time
            if ct.tzinfo is None:
                ct = ct.replace(tzinfo=UTC)
            if ct <= target:
                best = i
            else:
                break
        session.current_index = best
        return session.current_index

    def jump_to_event(
        self,
        session: ReplaySession,
        event_id: str,
    ) -> int:
        for event in session.events:
            if event.event_id == event_id:
                return self.jump_to_index(session, event.bar_index)
        return session.current_index

    def next_event(self, session: ReplaySession) -> ReplayEvent | None:
        for event in session.events:
            if event.bar_index > session.current_index:
                self.jump_to_index(session, event.bar_index)
                return event
        return None

    def previous_event(self, session: ReplaySession) -> ReplayEvent | None:
        prev: ReplayEvent | None = None
        for event in session.events:
            if event.bar_index >= session.current_index:
                break
            prev = event
        if prev:
            self.jump_to_index(session, prev.bar_index)
        return prev

    def set_playback(self, session: ReplaySession, *, playing: bool, speed: float | None = None) -> None:
        session.playback_state = (
            ReplayPlaybackState.PLAYING.value if playing else ReplayPlaybackState.PAUSED.value
        )
        if speed is not None:
            session.replay_speed = max(0.25, min(speed, 32.0))

    def build_frame(
        self,
        session: ReplaySession,
        enabled_overlays: set[str] | None = None,
    ) -> dict[str, Any]:
        idx = session.current_index
        visible = session.candles[: idx + 1] if idx >= 0 and session.candles else []
        candle = session.current_candle()

        return {
            "current_index": idx,
            "total_bars": session.total_bars,
            "current_time": candle.open_time.isoformat() if candle else None,
            "playback_state": session.playback_state,
            "replay_speed": session.replay_speed,
            "candles": [c.to_dict() for c in visible],
            "overlays": build_overlays(session, idx, enabled_overlays),
            "visible_events": [
                e.to_dict() for e in session.events if e.bar_index <= idx
            ],
        }

    def build_inspector(self, session: ReplaySession, bar_index: int | None = None) -> dict[str, Any]:
        idx = bar_index if bar_index is not None else session.current_index
        idx = max(0, min(idx, session.total_bars - 1))
        candle = session.candles[idx]
        open_time = candle.open_time

        indicators: dict[str, Any] = {}
        for plugin_id in ("ema", "sma", "rsi", "macd", "atr", "vwap", "bollinger_bands", "obv"):
            values = session.analysis_by_plugin.get(plugin_id, {}).get(open_time)
            if values:
                indicators[plugin_id] = values

        market_structure = session.analysis_by_plugin.get("market_structure", {}).get(open_time, {})
        order_blocks = session.analysis_by_plugin.get("order_blocks", {}).get(open_time, {})
        fair_value_gaps = session.analysis_by_plugin.get("fair_value_gaps", {}).get(open_time, {})
        liquidity_sweeps = session.analysis_by_plugin.get("liquidity_sweeps", {}).get(open_time, {})

        setup = next(
            (s for s in session.trade_setups if s.bar_index == idx),
            None,
        )
        decision = next(
            (d for d in session.strategy_decisions if d.bar_index == idx),
            None,
        )

        reasoning_parts: list[str] = []
        if setup:
            reasoning_parts.append(setup.explanation)
        if decision:
            reasoning_parts.append(decision.reasoning)

        return {
            "bar_index": idx,
            "open_time": open_time.isoformat(),
            "candle": candle.to_dict(),
            "indicators": indicators,
            "market_structure": market_structure,
            "smart_money": {
                "order_blocks": order_blocks,
                "fair_value_gaps": fair_value_gaps,
                "liquidity_sweeps": liquidity_sweeps,
            },
            "trade_setup": setup.to_dict() if setup else None,
            "strategy_evaluation": decision.to_dict() if decision else None,
            "confidence_scores": setup.evidence_scores if setup else {},
            "evidence_breakdown": setup.evidence_scores if setup else {},
            "reasoning": " | ".join(reasoning_parts) if reasoning_parts else None,
        }

    def build_debug(self, session: ReplaySession) -> dict[str, Any]:
        idx = session.current_index
        candle = session.candles[idx] if session.candles else None
        open_time = candle.open_time if candle else None

        raw_outputs: dict[str, Any] = {}
        if open_time:
            for plugin_id in PLUGIN_EXECUTION_ORDER:
                raw_outputs[plugin_id] = session.analysis_by_plugin.get(plugin_id, {}).get(open_time)

        return {
            "debug_mode": session.debug_mode,
            "current_index": idx,
            "open_time": open_time.isoformat() if open_time else None,
            "execution_order": list(PLUGIN_EXECUTION_ORDER),
            "params_hashes": session.params_hashes,
            "raw_plugin_outputs": raw_outputs,
            "json_payloads": raw_outputs,
        }

    def finalize_session(
        self,
        *,
        candles: list[ReplayCandle],
        analysis_by_plugin: dict[str, dict[datetime, dict[str, Any]]],
        trade_setups: list[TradeSetupSnapshot],
        strategy_decisions: list[StrategyDecisionSnapshot],
    ) -> tuple[list[ReplayEvent], dict[datetime, int]]:
        events = extract_events(candles, analysis_by_plugin, trade_setups, strategy_decisions)
        time_to_index = {c.open_time: i for i, c in enumerate(candles)}
        return events, time_to_index
