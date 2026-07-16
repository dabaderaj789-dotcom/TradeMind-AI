"""Fair Value Gap application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.engines.analysis.plugins.fair_value_gaps.plugin import PLUGIN_ID
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.analysis import ExecuteAnalysisRequest, PluginExecutionSpec
from app.schemas.fvg import (
    FvgExecuteRequest,
    FvgExecuteResponse,
    FvgListResponse,
    FvgRecord,
    FvgResultBar,
    FvgResultsResponse,
)
from app.services.analysis import AnalysisService


@dataclass
class FairValueGapService:
    """Fair Value Gap queries and execution via the Analysis Engine."""

    session: AsyncSession
    analysis_service: AnalysisService

    async def execute(self, request: FvgExecuteRequest) -> FvgExecuteResponse:
        params = dict(request.parameters or {})
        params.setdefault("timeframe_code", request.timeframe)
        exec_request = ExecuteAnalysisRequest(
            symbol_id=request.symbol_id,
            timeframe=request.timeframe,
            plugins=[PluginExecutionSpec(plugin_id=PLUGIN_ID, parameters=params)],
            start=request.start,
            end=request.end,
            candle_limit=request.candle_limit,
            persist=request.persist,
        )
        result = await self.analysis_service.execute(exec_request)
        plugin_result = result.results[0]
        return FvgExecuteResponse(
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
    ) -> FvgResultsResponse:
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
        return FvgResultsResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=[
                FvgResultBar(
                    open_time=r.open_time,
                    values=r.values,
                    computed_at=r.computed_at,
                )
                for r in rows
            ],
            total=total,
        )

    async def get_active(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
    ) -> FvgListResponse:
        row = await self._get_latest(symbol_id, timeframe_code)
        fvgs = row.values.get("active_fvgs") or []
        items = [_parse_fvg(f) for f in fvgs if f.get("status") in ("open", "partially_filled")]
        return FvgListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            as_of=row.open_time,
            items=items,
            total=len(items),
        )

    async def get_historical(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int = 500,
    ) -> FvgListResponse:
        items = await self._collect_unique(symbol_id, timeframe_code, limit=limit * 5)
        return FvgListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=items[:limit],
            total=len(items),
        )

    async def get_filled(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int = 200,
    ) -> FvgListResponse:
        all_fvgs = await self._collect_unique(symbol_id, timeframe_code, limit=limit * 10)
        filled = [
            f for f in all_fvgs
            if f.status in ("partially_filled", "fully_filled")
            or f.fill_state in ("partially_filled", "fully_filled")
        ]
        return FvgListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=filled[:limit],
            total=len(filled),
        )

    async def get_invalidated(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int = 200,
    ) -> FvgListResponse:
        all_fvgs = await self._collect_unique(symbol_id, timeframe_code, limit=limit * 10)
        invalidated = [f for f in all_fvgs if f.status == "invalidated"]
        return FvgListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=invalidated[:limit],
            total=len(invalidated),
        )

    async def _get_latest(self, symbol_id: uuid.UUID, timeframe_code: str):
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        row = await AnalysisResultRepository(self.session).get_latest_result(
            symbol_id,
            timeframe.id,
            plugin_id=PLUGIN_ID,
        )
        if row is None:
            raise NotFoundError(
                "No fair value gap results found",
                detail=f"symbol_id={symbol_id}, timeframe={timeframe_code}",
            )
        return row

    async def _collect_unique(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int,
    ) -> list[FvgRecord]:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        rows = await AnalysisResultRepository(self.session).get_results(
            symbol_id,
            timeframe.id,
            plugin_id=PLUGIN_ID,
            limit=limit,
        )
        seen: dict[str, FvgRecord] = {}
        for row in rows:
            for key in ("new_fvgs", "active_fvgs", "filled_fvgs", "invalidated_fvgs"):
                for raw in row.values.get(key) or []:
                    fid = raw.get("fvg_id")
                    if fid:
                        seen[fid] = _parse_fvg(raw)
        return sorted(seen.values(), key=lambda f: f.created_at)


def _parse_fvg(raw: dict) -> FvgRecord:
    created = raw.get("created_at")
    if isinstance(created, str):
        created = datetime.fromisoformat(created)

    def _parse_dt(key: str) -> datetime | None:
        val = raw.get(key)
        if val is None:
            return None
        if isinstance(val, str):
            return datetime.fromisoformat(val)
        return val

    return FvgRecord(
        fvg_id=str(raw["fvg_id"]),
        type=str(raw["type"]),
        gap_high=float(raw["gap_high"]),
        gap_low=float(raw["gap_low"]),
        gap_size=float(raw.get("gap_size", raw["gap_high"] - raw["gap_low"])),
        gap_percent=float(raw.get("gap_percent", 0)),
        status=str(raw.get("status", "open")),
        fill_state=str(raw.get("fill_state", "open")),
        fill_percentage=float(raw.get("fill_percentage", 0)),
        quality_score=float(raw.get("quality_score", 0)),
        quality_components=dict(raw.get("quality_components") or {}),
        confidence=float(raw.get("confidence", 0)),
        explanation=str(raw.get("explanation", "")),
        created_at=created,
        timeframe_code=str(raw.get("timeframe_code", "")),
        trend=str(raw.get("trend", "sideways")),
        market_phase=str(raw.get("market_phase", "ranging")),
        associated_order_block_id=raw.get("associated_order_block_id"),
        associated_bos=raw.get("associated_bos"),
        associated_choch=raw.get("associated_choch"),
        first_touch_at=_parse_dt("first_touch_at"),
        full_fill_at=_parse_dt("full_fill_at"),
        invalidation_at=_parse_dt("invalidation_at"),
        invalidation_reason=raw.get("invalidation_reason"),
    )
