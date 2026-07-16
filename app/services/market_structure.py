"""Market Structure application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.analysis.plugins.market_structure.plugin import PLUGIN_ID
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.analysis import ExecuteAnalysisRequest, PluginExecutionSpec
from app.schemas.market_structure import (
    LevelsResponse,
    MarketStructureExecuteRequest,
    MarketStructureExecuteResponse,
    MarketStructureResultBar,
    MarketStructureResultsResponse,
    StructureEventResponse,
    StructureEventsResponse,
    TrendResponse,
)
from app.services.analysis import AnalysisService


@dataclass
class MarketStructureService:
    """Market Structure queries and execution via the Analysis Engine."""

    session: AsyncSession
    analysis_service: AnalysisService

    async def execute(self, request: MarketStructureExecuteRequest) -> MarketStructureExecuteResponse:
        exec_request = ExecuteAnalysisRequest(
            symbol_id=request.symbol_id,
            timeframe=request.timeframe,
            plugins=[
                PluginExecutionSpec(
                    plugin_id=PLUGIN_ID,
                    parameters=request.parameters,
                )
            ],
            start=request.start,
            end=request.end,
            candle_limit=request.candle_limit,
            persist=request.persist,
        )
        result = await self.analysis_service.execute(exec_request)
        plugin_result = result.results[0]
        return MarketStructureExecuteResponse(
            symbol_id=result.symbol_id,
            timeframe=result.timeframe,
            computed_at=result.computed_at,
            bars_computed=plugin_result.bars_computed,
            bars_persisted=plugin_result.bars_persisted,
            plugin_version=plugin_result.plugin_version,
            params_hash=plugin_result.params_hash,
        )

    async def get_results(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 500,
    ) -> MarketStructureResultsResponse:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        repo = AnalysisResultRepository(self.session)
        rows = await repo.get_results(
            symbol_id,
            timeframe.id,
            plugin_id=PLUGIN_ID,
            start=start,
            end=end,
            limit=limit,
        )
        total = await repo.count_results(symbol_id, timeframe.id, plugin_id=PLUGIN_ID)
        return MarketStructureResultsResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=[
                MarketStructureResultBar(
                    open_time=r.open_time,
                    values=r.values,
                    computed_at=r.computed_at,
                )
                for r in rows
            ],
            total=total,
        )

    async def get_current_trend(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
    ) -> TrendResponse:
        row = await self._get_latest(symbol_id, timeframe_code)
        values = row.values
        return TrendResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            as_of=row.open_time,
            trend=str(values.get("trend", "sideways")),
            market_phase=str(values.get("market_phase", "ranging")),
            phase_confidence=float(values.get("phase_confidence", 0)),
            confidence=float(values.get("confidence", 0)),
        )

    async def get_levels(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
    ) -> LevelsResponse:
        from app.schemas.market_structure import DynamicLevelResponse

        row = await self._get_latest(symbol_id, timeframe_code)
        values = row.values

        def parse_levels(raw: list | None) -> list[DynamicLevelResponse]:
            if not raw:
                return []
            out: list[DynamicLevelResponse] = []
            for item in raw:
                out.append(
                    DynamicLevelResponse(
                        price=float(item["price"]),
                        strength=float(item["strength"]),
                        touches=int(item["touches"]),
                        created_at=datetime.fromisoformat(item["created_at"]),
                        last_validated_at=datetime.fromisoformat(item["last_validated_at"]),
                    )
                )
            return out

        return LevelsResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            as_of=row.open_time,
            support_levels=parse_levels(values.get("support_levels")),
            resistance_levels=parse_levels(values.get("resistance_levels")),
        )

    async def get_events(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int = 200,
    ) -> StructureEventsResponse:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        repo = AnalysisResultRepository(self.session)
        rows = await repo.get_results(
            symbol_id,
            timeframe.id,
            plugin_id=PLUGIN_ID,
            limit=limit * 5,
        )

        bos_events: list[StructureEventResponse] = []
        choch_events: list[StructureEventResponse] = []

        for row in reversed(rows):
            if row.values.get("bos"):
                bos_events.append(_parse_event(row.values["bos"], row.open_time))
            if row.values.get("choch"):
                choch_events.append(_parse_event(row.values["choch"], row.open_time))

        bos_events = bos_events[-limit:]
        choch_events = choch_events[-limit:]

        return StructureEventsResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            bos_events=bos_events,
            choch_events=choch_events,
            total=len(bos_events) + len(choch_events),
        )

    async def _get_latest(self, symbol_id: uuid.UUID, timeframe_code: str):
        from app.core.exceptions import NotFoundError

        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        row = await AnalysisResultRepository(self.session).get_latest_result(
            symbol_id,
            timeframe.id,
            plugin_id=PLUGIN_ID,
        )
        if row is None:
            raise NotFoundError(
                "No market structure results found",
                detail=f"symbol_id={symbol_id}, timeframe={timeframe_code}",
            )
        return row


def _parse_event(raw: dict, open_time: datetime) -> StructureEventResponse:
    break_time = raw.get("break_time", open_time.isoformat())
    if isinstance(break_time, str):
        break_time = datetime.fromisoformat(break_time)
    return StructureEventResponse(
        event_type=str(raw["type"]),
        broken_swing_price=float(raw["broken_swing_price"]),
        break_price=float(raw["break_price"]),
        break_time=break_time,
        open_time=open_time,
    )
