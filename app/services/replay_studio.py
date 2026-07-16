"""Replay Studio application service."""

from __future__ import annotations

import sys
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError as AppValidationError
from app.engines.replay_studio.engine import ReplayStudioEngine
from app.engines.replay_studio.store import ReplaySessionStore
from app.engines.replay_studio.types import (
    ALL_REPLAY_PLUGINS,
    REPLAY_STUDIO_VERSION,
    LoadTiming,
    ReplayCandle,
    ReplaySession,
    SessionMetrics,
    StrategyDecisionSnapshot,
    TradeSetupSnapshot,
)
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.candle import CandleRepository
from app.repositories.strategy_backtest import TradePlanRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.repositories.trade_setup import TradeSetupRepository
from app.schemas.replay_studio import (
    ReplayDebugResponse,
    ReplayEventResponse,
    ReplayEventsListResponse,
    ReplayFrameResponse,
    ReplayInspectorResponse,
    ReplayMetricsResponse,
    ReplayPlaybackHintResponse,
    ReplaySessionCreateRequest,
    ReplaySessionResponse,
    ReplaySettingsRequest,
)


@dataclass
class ReplayStudioService:
    session: AsyncSession
    engine: ReplayStudioEngine | None = None

    def _engine(self) -> ReplayStudioEngine:
        return self.engine or ReplayStudioEngine()

    async def create_session(self, request: ReplaySessionCreateRequest) -> ReplaySessionResponse:
        symbol = await SymbolRepository(self.session).get_by_id_or_raise(request.symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(request.timeframe)

        t0 = time.perf_counter()
        candle_repo = CandleRepository(self.session)
        orm_candles = await candle_repo.get_candles_for_analysis(
            symbol.id,
            timeframe.id,
            start=request.start,
            end=request.end,
            limit=request.candle_limit,
        )
        if not orm_candles:
            raise AppValidationError("No candles available for replay", detail=str(symbol.id))

        candles = [
            ReplayCandle(
                open_time=c.open_time,
                open=float(c.open),
                high=float(c.high),
                low=float(c.low),
                close=float(c.close),
                volume=float(c.volume),
            )
            for c in orm_candles
        ]
        db_candle_ms = (time.perf_counter() - t0) * 1000

        analysis_by_plugin: dict[str, dict[datetime, dict[str, Any]]] = {}
        params_hashes: dict[str, str] = {}
        load_timings: list[LoadTiming] = []
        result_repo = AnalysisResultRepository(self.session)

        for plugin_id in ALL_REPLAY_PLUGINS:
            pt0 = time.perf_counter()
            phash = await result_repo.get_latest_params_hash(symbol.id, timeframe.id, plugin_id)
            if phash is None:
                continue
            params_hashes[plugin_id] = phash
            rows = await result_repo.get_results(
                symbol.id,
                timeframe.id,
                plugin_id=plugin_id,
                params_hash=phash,
                start=request.start,
                end=request.end,
                limit=request.candle_limit,
            )
            analysis_by_plugin[plugin_id] = {r.open_time: dict(r.values or {}) for r in rows}
            load_timings.append(
                LoadTiming(
                    plugin_id=plugin_id,
                    duration_ms=(time.perf_counter() - pt0) * 1000,
                    rows_loaded=len(rows),
                )
            )

        time_to_index = {c.open_time: i for i, c in enumerate(candles)}

        setup_rows = await TradeSetupRepository(self.session).list_setups(
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
            limit=5000,
        )
        trade_setups = [
            TradeSetupSnapshot(
                setup_id=s.setup_id,
                setup_type=s.setup_type,
                direction=s.direction,
                confidence_score=s.confidence_score,
                confidence_level=s.confidence_level,
                evidence_scores=dict(s.evidence_scores or {}),
                entry_zone=dict(s.entry_zone or {}),
                stop_loss_zone=dict(s.stop_loss_zone or {}),
                target_zones=list(s.target_zones or []),
                risk_reward=s.risk_reward,
                explanation=s.explanation,
                reference_ids=dict(s.reference_ids or {}),
                detected_at=s.detected_at,
                bar_index=time_to_index.get(s.detected_at, 0),
                status=s.status,
            )
            for s in setup_rows
        ]

        plan_rows = await TradePlanRepository(self.session).list_plans(
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
            strategy_id=request.strategy_id,
            limit=5000,
        )
        strategy_decisions = [
            StrategyDecisionSnapshot(
                plan_id=p.plan_id,
                strategy_id=p.strategy_id,
                setup_id=p.setup_id,
                direction=p.direction,
                entry_zone=dict(p.entry_zone or {}),
                stop_loss=p.stop_loss,
                target_1=p.target_1,
                target_2=p.target_2,
                target_3=p.target_3,
                risk_reward=p.risk_reward,
                strategy_confidence=p.strategy_confidence,
                reasoning=p.reasoning,
                detected_at=p.detected_at,
                bar_index=time_to_index.get(p.detected_at, 0),
            )
            for p in plan_rows
        ]

        eng = self._engine()
        events, _ = eng.finalize_session(
            candles=candles,
            analysis_by_plugin=analysis_by_plugin,
            trade_setups=trade_setups,
            strategy_decisions=strategy_decisions,
        )

        total_load_ms = (time.perf_counter() - t0) * 1000
        memory_est = _estimate_memory(candles, analysis_by_plugin, events)

        metrics = SessionMetrics(
            candles_loaded=len(candles),
            plugins_loaded=len(analysis_by_plugin),
            events_extracted=len(events),
            load_timings=load_timings,
            total_load_ms=total_load_ms,
            db_query_ms=db_candle_ms,
            memory_estimate_bytes=memory_est,
            cache_misses=len(load_timings),
        )

        session_id = uuid.uuid4()
        initial_index = min(request.initial_index, len(candles) - 1)
        replay_session = ReplaySession(
            session_id=session_id,
            symbol_id=symbol.id,
            symbol_code=symbol.symbol_code,
            timeframe_id=timeframe.id,
            timeframe_code=timeframe.code,
            candles=candles,
            analysis_by_plugin=analysis_by_plugin,
            params_hashes=params_hashes,
            trade_setups=trade_setups,
            strategy_decisions=strategy_decisions,
            events=events,
            time_to_index=time_to_index,
            current_index=initial_index,
            metrics=metrics,
            created_at=datetime.now(UTC),
        )
        ReplaySessionStore.put(replay_session)

        candle = replay_session.current_candle()
        return ReplaySessionResponse(
            session_id=session_id,
            symbol_id=symbol.id,
            symbol_code=symbol.symbol_code,
            timeframe=timeframe.code,
            total_bars=len(candles),
            current_index=initial_index,
            current_time=candle.open_time if candle else None,
            playback_state=replay_session.playback_state,
            replay_speed=replay_session.replay_speed,
            debug_mode=False,
            validation_mode=False,
            events_count=len(events),
            engine_version=REPLAY_STUDIO_VERSION,
        )

    async def get_session(self, session_id: uuid.UUID) -> ReplaySessionResponse:
        s = ReplaySessionStore.get(session_id)
        candle = s.current_candle()
        return ReplaySessionResponse(
            session_id=s.session_id,
            symbol_id=s.symbol_id,
            symbol_code=s.symbol_code,
            timeframe=s.timeframe_code,
            total_bars=s.total_bars,
            current_index=s.current_index,
            current_time=candle.open_time if candle else None,
            playback_state=s.playback_state,
            replay_speed=s.replay_speed,
            debug_mode=s.debug_mode,
            validation_mode=s.validation_mode,
            events_count=len(s.events),
            engine_version=REPLAY_STUDIO_VERSION,
        )

    async def get_frame(
        self,
        session_id: uuid.UUID,
        enabled_overlays: set[str] | None = None,
    ) -> ReplayFrameResponse:
        s = ReplaySessionStore.get(session_id)
        eng = self._engine()
        frame = eng.build_frame(s, enabled_overlays)
        candle = s.current_candle()
        return ReplayFrameResponse(
            session_id=session_id,
            current_index=frame["current_index"],
            total_bars=frame["total_bars"],
            current_time=candle.open_time if candle else None,
            playback_state=frame["playback_state"],
            replay_speed=frame["replay_speed"],
            candles=frame["candles"],
            overlays=frame["overlays"],
            visible_events=frame["visible_events"],
        )

    async def step_forward(self, session_id: uuid.UUID, steps: int = 1) -> ReplayFrameResponse:
        s = ReplaySessionStore.get(session_id)
        self._engine().step_forward(s, steps)
        return await self.get_frame(session_id)

    async def step_back(self, session_id: uuid.UUID, steps: int = 1) -> ReplayFrameResponse:
        s = ReplaySessionStore.get(session_id)
        self._engine().step_back(s, steps)
        return await self.get_frame(session_id)

    async def jump(self, session_id: uuid.UUID, *, index: int | None, open_time: datetime | None) -> ReplayFrameResponse:
        s = ReplaySessionStore.get(session_id)
        eng = self._engine()
        if index is not None:
            eng.jump_to_index(s, index)
        elif open_time is not None:
            eng.jump_to_date(s, open_time)
        else:
            raise AppValidationError("Provide index or open_time for jump")
        return await self.get_frame(session_id)

    async def jump_event(
        self,
        session_id: uuid.UUID,
        *,
        event_id: str | None,
        direction: str,
    ) -> ReplayFrameResponse:
        s = ReplaySessionStore.get(session_id)
        eng = self._engine()
        if event_id:
            eng.jump_to_event(s, event_id)
        elif direction == "next":
            eng.next_event(s)
        else:
            eng.previous_event(s)
        return await self.get_frame(session_id)

    async def set_playback(
        self,
        session_id: uuid.UUID,
        *,
        playing: bool,
        speed: float | None,
    ) -> ReplayPlaybackHintResponse:
        s = ReplaySessionStore.get(session_id)
        self._engine().set_playback(s, playing=playing, speed=speed)
        return ReplayPlaybackHintResponse(
            session_id=session_id,
            playback_state=s.playback_state,
            replay_speed=s.replay_speed,
            tick_interval_ms=_tick_ms(s.replay_speed),
            current_index=s.current_index,
            total_bars=s.total_bars,
        )

    async def update_settings(
        self,
        session_id: uuid.UUID,
        request: ReplaySettingsRequest,
    ) -> ReplaySessionResponse:
        s = ReplaySessionStore.get(session_id)
        if request.debug_mode is not None:
            s.debug_mode = request.debug_mode
        if request.validation_mode is not None:
            s.validation_mode = request.validation_mode
        return await self.get_session(session_id)

    async def get_inspector(
        self,
        session_id: uuid.UUID,
        bar_index: int | None = None,
    ) -> ReplayInspectorResponse:
        s = ReplaySessionStore.get(session_id)
        data = self._engine().build_inspector(s, bar_index)
        return ReplayInspectorResponse(
            session_id=session_id,
            bar_index=data["bar_index"],
            open_time=datetime.fromisoformat(data["open_time"]),
            candle=data["candle"],
            indicators=data["indicators"],
            market_structure=data["market_structure"],
            smart_money=data["smart_money"],
            trade_setup=data["trade_setup"],
            strategy_evaluation=data["strategy_evaluation"],
            confidence_scores=data["confidence_scores"],
            evidence_breakdown=data["evidence_breakdown"],
            reasoning=data["reasoning"],
        )

    async def list_events(self, session_id: uuid.UUID) -> ReplayEventsListResponse:
        s = ReplaySessionStore.get(session_id)
        items = [
            ReplayEventResponse(
                event_id=e.event_id,
                event_type=e.event_type,
                bar_index=e.bar_index,
                open_time=e.open_time,
                label=e.label,
                direction=e.direction,
                price=e.price,
                metadata=e.metadata,
            )
            for e in s.events
        ]
        return ReplayEventsListResponse(session_id=session_id, items=items, total=len(items))

    async def get_debug(self, session_id: uuid.UUID) -> ReplayDebugResponse:
        s = ReplaySessionStore.get(session_id)
        data = self._engine().build_debug(s)
        open_time = None
        if data["open_time"]:
            open_time = datetime.fromisoformat(data["open_time"])
        return ReplayDebugResponse(
            session_id=session_id,
            debug_mode=data["debug_mode"],
            current_index=data["current_index"],
            open_time=open_time,
            execution_order=data["execution_order"],
            params_hashes=data["params_hashes"],
            raw_plugin_outputs=data["raw_plugin_outputs"],
            json_payloads=data["json_payloads"],
        )

    async def get_metrics(self, session_id: uuid.UUID) -> ReplayMetricsResponse:
        s = ReplaySessionStore.get(session_id)
        return ReplayMetricsResponse(
            session_id=session_id,
            metrics=s.metrics.to_dict(),
            tick_interval_ms=_tick_ms(s.replay_speed),
        )

    async def delete_session(self, session_id: uuid.UUID) -> None:
        try:
            ReplaySessionStore.get(session_id)
        except NotFoundError:
            raise
        ReplaySessionStore.delete(session_id)


def _tick_ms(speed: float) -> int:
    base = 500
    return max(50, int(base / max(speed, 0.25)))


def _estimate_memory(
    candles: list[ReplayCandle],
    analysis: dict[str, dict[datetime, dict[str, Any]]],
    events: list,
) -> int:
    total = sys.getsizeof(candles)
    for plugin_data in analysis.values():
        total += sys.getsizeof(plugin_data)
        for values in plugin_data.values():
            total += sys.getsizeof(values)
    total += sys.getsizeof(events)
    return total
