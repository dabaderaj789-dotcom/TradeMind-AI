"""Liquidity Sweep application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.engines.analysis.plugins.liquidity_sweeps.plugin import PLUGIN_ID
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.analysis import ExecuteAnalysisRequest, PluginExecutionSpec
from app.schemas.liquidity_sweep import (
    LiquiditySweepDetailResponse,
    LiquiditySweepExecuteRequest,
    LiquiditySweepExecuteResponse,
    LiquiditySweepListResponse,
    LiquiditySweepRecord,
    LiquiditySweepResultBar,
    LiquiditySweepResultsResponse,
)
from app.services.analysis import AnalysisService


@dataclass
class LiquiditySweepService:
    """Liquidity Sweep queries and execution via the Analysis Engine."""

    session: AsyncSession
    analysis_service: AnalysisService

    async def execute(
        self, request: LiquiditySweepExecuteRequest,
    ) -> LiquiditySweepExecuteResponse:
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
        return LiquiditySweepExecuteResponse(
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
    ) -> LiquiditySweepResultsResponse:
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
        return LiquiditySweepResultsResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=[
                LiquiditySweepResultBar(
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
    ) -> LiquiditySweepListResponse:
        row = await self._get_latest(symbol_id, timeframe_code)
        sweeps = row.values.get("active_sweeps") or []
        items = [_parse_sweep(s) for s in sweeps]
        return LiquiditySweepListResponse(
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
    ) -> LiquiditySweepListResponse:
        items = await self._collect_unique(symbol_id, timeframe_code, limit=limit * 5)
        return LiquiditySweepListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=items[:limit],
            total=len(items),
        )

    async def get_failed(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int = 200,
    ) -> LiquiditySweepListResponse:
        all_sweeps = await self._collect_unique(symbol_id, timeframe_code, limit=limit * 10)
        failed = [s for s in all_sweeps if s.status == "failed"]
        return LiquiditySweepListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=failed[:limit],
            total=len(failed),
        )

    async def get_details(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        sweep_id: str,
    ) -> LiquiditySweepDetailResponse:
        all_sweeps = await self._collect_unique(symbol_id, timeframe_code, limit=5000)
        for sweep in all_sweeps:
            if sweep.sweep_id == sweep_id:
                return LiquiditySweepDetailResponse(
                    symbol_id=symbol_id,
                    timeframe=timeframe_code,
                    item=sweep,
                )
        raise NotFoundError(
            "Liquidity sweep not found",
            detail=f"sweep_id={sweep_id}, symbol_id={symbol_id}, timeframe={timeframe_code}",
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
                "No liquidity sweep results found",
                detail=f"symbol_id={symbol_id}, timeframe={timeframe_code}",
            )
        return row

    async def _collect_unique(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int,
    ) -> list[LiquiditySweepRecord]:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        rows = await AnalysisResultRepository(self.session).get_results(
            symbol_id,
            timeframe.id,
            plugin_id=PLUGIN_ID,
            limit=limit,
        )
        seen: dict[str, LiquiditySweepRecord] = {}
        for row in rows:
            for key in (
                "new_sweeps",
                "active_sweeps",
                "confirmed_sweeps",
                "failed_sweeps",
                "invalidated_sweeps",
            ):
                for raw in row.values.get(key) or []:
                    sid = raw.get("sweep_id")
                    if sid:
                        seen[sid] = _parse_sweep(raw)
        return sorted(seen.values(), key=lambda s: s.created_at)


def _parse_sweep(raw: dict) -> LiquiditySweepRecord:
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

    return LiquiditySweepRecord(
        sweep_id=str(raw["sweep_id"]),
        type=str(raw["type"]),
        sweep_level=float(raw["sweep_level"]),
        level_type=str(raw.get("level_type", "")),
        penetration_depth=float(raw.get("penetration_depth", 0)),
        status=str(raw.get("status", "active")),
        strength_score=float(raw.get("strength_score", 0)),
        strength_components=dict(raw.get("strength_components") or {}),
        confirmation_components=dict(raw.get("confirmation_components") or {}),
        confidence=float(raw.get("confidence", 0)),
        explanation=str(raw.get("explanation", "")),
        created_at=created,
        timeframe_code=str(raw.get("timeframe_code", "")),
        trend=str(raw.get("trend", "sideways")),
        market_phase=str(raw.get("market_phase", "ranging")),
        related_order_block_id=raw.get("related_order_block_id"),
        related_fvg_id=raw.get("related_fvg_id"),
        associated_bos=raw.get("associated_bos"),
        associated_choch=raw.get("associated_choch"),
        nearest_swing_index=raw.get("nearest_swing_index"),
        nearest_swing_price=raw.get("nearest_swing_price"),
        lifecycle_events=list(raw.get("lifecycle_events") or []),
        confirmed_at=_parse_dt("confirmed_at"),
        failed_at=_parse_dt("failed_at"),
        invalidated_at=_parse_dt("invalidated_at"),
    )
