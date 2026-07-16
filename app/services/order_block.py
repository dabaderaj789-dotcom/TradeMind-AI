"""Order Block application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.engines.analysis.plugins.order_blocks.plugin import PLUGIN_ID
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.analysis import ExecuteAnalysisRequest, PluginExecutionSpec
from app.schemas.order_block import (
    OrderBlockExecuteRequest,
    OrderBlockExecuteResponse,
    OrderBlockListResponse,
    OrderBlockRecord,
    OrderBlockResultBar,
    OrderBlockResultsResponse,
)
from app.services.analysis import AnalysisService


@dataclass
class OrderBlockService:
    """Order Block queries and execution via the Analysis Engine."""

    session: AsyncSession
    analysis_service: AnalysisService

    async def execute(self, request: OrderBlockExecuteRequest) -> OrderBlockExecuteResponse:
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
        return OrderBlockExecuteResponse(
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
    ) -> OrderBlockResultsResponse:
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
        return OrderBlockResultsResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=[
                OrderBlockResultBar(
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
    ) -> OrderBlockListResponse:
        row = await self._get_latest(symbol_id, timeframe_code)
        blocks = row.values.get("active_order_blocks") or []
        items = [_parse_block(b) for b in blocks if b.get("status") != "invalidated"]
        return OrderBlockListResponse(
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
    ) -> OrderBlockListResponse:
        blocks = await self._collect_unique_blocks(symbol_id, timeframe_code, limit=limit * 5)
        return OrderBlockListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=blocks[:limit],
            total=len(blocks),
        )

    async def get_mitigated(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int = 200,
    ) -> OrderBlockListResponse:
        all_blocks = await self._collect_unique_blocks(symbol_id, timeframe_code, limit=limit * 10)
        mitigated = [
            b
            for b in all_blocks
            if b.mitigation_state in ("first_touch", "partially_mitigated", "fully_mitigated")
            and b.status != "invalidated"
        ]
        return OrderBlockListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=mitigated[:limit],
            total=len(mitigated),
        )

    async def get_invalidated(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int = 200,
    ) -> OrderBlockListResponse:
        all_blocks = await self._collect_unique_blocks(symbol_id, timeframe_code, limit=limit * 10)
        invalidated = [b for b in all_blocks if b.status == "invalidated"]
        return OrderBlockListResponse(
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
                "No order block results found",
                detail=f"symbol_id={symbol_id}, timeframe={timeframe_code}",
            )
        return row

    async def _collect_unique_blocks(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        limit: int,
    ) -> list[OrderBlockRecord]:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        rows = await AnalysisResultRepository(self.session).get_results(
            symbol_id,
            timeframe.id,
            plugin_id=PLUGIN_ID,
            limit=limit,
        )
        seen: dict[str, OrderBlockRecord] = {}
        for row in rows:
            for key in ("new_order_blocks", "active_order_blocks", "mitigated_order_blocks", "invalidated_order_blocks"):
                for raw in row.values.get(key) or []:
                    bid = raw.get("order_block_id")
                    if not bid:
                        continue
                    seen[bid] = _parse_block(raw)
        return sorted(seen.values(), key=lambda b: b.created_at)


def _parse_block(raw: dict) -> OrderBlockRecord:
    created = raw.get("created_at")
    if isinstance(created, str):
        created = datetime.fromisoformat(created)
    inv_at = raw.get("invalidation_at")
    if isinstance(inv_at, str):
        inv_at = datetime.fromisoformat(inv_at)
    return OrderBlockRecord(
        order_block_id=str(raw["order_block_id"]),
        type=str(raw["type"]),
        zone_high=float(raw["zone_high"]),
        zone_low=float(raw["zone_low"]),
        status=str(raw.get("status", "fresh")),
        mitigation_state=str(raw.get("mitigation_state", "untouched")),
        touch_count=int(raw.get("touch_count", 0)),
        strength_score=float(raw.get("strength_score", 0)),
        strength_components=dict(raw.get("strength_components") or {}),
        confidence=float(raw.get("confidence", 0)),
        explanation=str(raw.get("explanation", "")),
        created_at=created,
        timeframe_code=str(raw.get("timeframe_code", "")),
        invalidation_at=inv_at,
        invalidation_reason=raw.get("invalidation_reason"),
    )
