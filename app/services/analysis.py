"""Analysis Engine application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError as AppValidationError
from app.engines.analysis.engine import AnalysisEngine
from app.engines.analysis.registry import AnalysisPluginRegistry
from app.engines.analysis.types import ExecutionMode, PluginExecutionRequest
from app.engines.analysis.utils import candle_model_to_bar
from app.repositories.analysis_plugin import AnalysisPluginRepository
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.candle import CandleRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.analysis import (
    AnalysisResultBarResponse,
    AnalysisResultListResponse,
    ExecuteAnalysisRequest,
    ExecuteAnalysisResponse,
    PluginMetadataResponse,
    SymbolAnalysisResult,
)


@dataclass
class AnalysisService:
    """Orchestrates analysis execution and result persistence."""

    session: AsyncSession
    engine: AnalysisEngine
    registry: AnalysisPluginRegistry

    async def list_plugins(self) -> list[PluginMetadataResponse]:
        await self._sync_plugins()
        return [
            PluginMetadataResponse(
                plugin_id=m.plugin_id,
                plugin_name=m.plugin_name,
                plugin_version=m.plugin_version,
                category=m.category,
                required_history=m.required_history,
                default_parameters=m.default_parameters,
                output_schema=m.output_schema,
                description=m.description,
                dependencies=m.dependencies,
            )
            for m in self.registry.list_metadata()
        ]

    async def get_plugin_metadata(self, plugin_id: str) -> PluginMetadataResponse:
        await self._sync_plugins()
        meta = self.registry.get_metadata(plugin_id)
        return PluginMetadataResponse(
            plugin_id=meta.plugin_id,
            plugin_name=meta.plugin_name,
            plugin_version=meta.plugin_version,
            category=meta.category,
            required_history=meta.required_history,
            default_parameters=meta.default_parameters,
            output_schema=meta.output_schema,
            description=meta.description,
            dependencies=meta.dependencies,
        )

    async def execute(self, request: ExecuteAnalysisRequest) -> ExecuteAnalysisResponse:
        symbol = await SymbolRepository(self.session).get_by_id_or_raise(request.symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(request.timeframe)

        candle_repo = CandleRepository(self.session)
        orm_candles = await candle_repo.get_candles_for_analysis(
            symbol.id,
            timeframe.id,
            start=request.start,
            end=request.end,
            limit=request.candle_limit,
        )

        if not orm_candles:
            raise AppValidationError(
                "No candles available for analysis",
                detail=f"symbol_id={symbol.id}, timeframe={timeframe.code}",
            )

        bars = [candle_model_to_bar(c) for c in orm_candles]
        plugin_requests = [
            PluginExecutionRequest(
                plugin_id=spec.plugin_id,
                parameters=spec.parameters or {},
            )
            for spec in request.plugins
        ]

        ordered_ids = self.engine.resolve_dependencies([p.plugin_id for p in plugin_requests])
        ordered_requests = sorted(
            plugin_requests,
            key=lambda r: ordered_ids.index(r.plugin_id),
        )

        job = AnalysisEngine.build_job(
            symbol_id=str(symbol.id),
            timeframe_id=timeframe.id,
            timeframe_code=timeframe.code,
            candles=bars,
            plugin_requests=ordered_requests,
            mode=ExecutionMode.BATCH,
        )

        job_result = await self.engine.run_job(job)
        result_repo = AnalysisResultRepository(self.session)
        symbol_results: list[SymbolAnalysisResult] = []

        for plugin_result in job_result.plugin_results:
            persisted = 0
            if request.persist and plugin_result.success:
                persisted = await result_repo.bulk_insert_results(
                    symbol_id=symbol.id,
                    timeframe_id=timeframe.id,
                    plugin_result=plugin_result,
                    computed_at=job_result.computed_at,
                )

            symbol_results.append(
                SymbolAnalysisResult(
                    plugin_id=plugin_result.plugin_id,
                    plugin_version=plugin_result.plugin_version,
                    parameters=plugin_result.parameters,
                    params_hash=plugin_result.params_hash,
                    success=plugin_result.success,
                    bars_computed=len(plugin_result.results),
                    bars_persisted=persisted,
                    error=plugin_result.error,
                )
            )

        logger.info(
            "Analysis executed for {} {} — {} plugins",
            symbol.symbol_code,
            timeframe.code,
            len(symbol_results),
        )

        return ExecuteAnalysisResponse(
            symbol_id=symbol.id,
            timeframe=timeframe.code,
            computed_at=job_result.computed_at,
            results=symbol_results,
        )

    async def get_results(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        plugin_id: str | None = None,
        plugin_version: str | None = None,
        params_hash: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 500,
    ) -> AnalysisResultListResponse:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)

        repo = AnalysisResultRepository(self.session)
        rows = await repo.get_results(
            symbol_id,
            timeframe.id,
            plugin_id=plugin_id,
            plugin_version=plugin_version,
            params_hash=params_hash,
            start=start,
            end=end,
            limit=limit,
        )
        total = await repo.count_results(
            symbol_id,
            timeframe.id,
            plugin_id=plugin_id,
            params_hash=params_hash,
        )

        return AnalysisResultListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            plugin_id=plugin_id,
            items=[
                AnalysisResultBarResponse(
                    open_time=r.open_time,
                    plugin_id=r.plugin_id,
                    plugin_version=r.plugin_version,
                    params_hash=r.params_hash,
                    values=r.values,
                    computed_at=r.computed_at,
                )
                for r in rows
            ],
            total=total,
        )

    async def _sync_plugins(self) -> None:
        repo = AnalysisPluginRepository(self.session)
        await repo.sync_all(self.registry.list_metadata())
