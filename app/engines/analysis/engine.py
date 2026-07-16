"""Analysis engine orchestrator."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from functools import partial

from loguru import logger

from app.engines.analysis.registry import AnalysisPluginRegistry
from app.engines.analysis.types import (
    AnalysisJob,
    AnalysisJobResult,
    ExecutionMode,
    PluginExecutionRequest,
    PluginExecutionResult,
)
from app.engines.analysis.utils import hash_parameters


class AnalysisEngine:
    """
    Plugin-based analysis engine.

    Independent of REST APIs — consumes candle data via AnalysisJob.
    Supports batch, live, and replay modes (live/replay wired in future sprints).
    """

    def __init__(
        self,
        registry: AnalysisPluginRegistry,
        *,
        max_workers: int = 4,
    ) -> None:
        self._registry = registry
        self._executor = ThreadPoolExecutor(max_workers=max_workers)

    async def run_job(self, job: AnalysisJob) -> AnalysisJobResult:
        """Execute all plugins for a single symbol/timeframe job with error isolation."""
        computed_at = datetime.now(UTC)
        plugin_results = await self._run_plugins_parallel(job)
        return AnalysisJobResult(
            symbol_id=job.symbol_id,
            timeframe_id=job.timeframe_id,
            timeframe_code=job.timeframe_code,
            mode=job.mode,
            plugin_results=plugin_results,
            computed_at=computed_at,
        )

    async def run_batch(
        self,
        jobs: list[AnalysisJob],
    ) -> list[AnalysisJobResult]:
        """Execute multiple symbol/timeframe jobs concurrently."""
        tasks = [self.run_job(job) for job in jobs]
        return list(await asyncio.gather(*tasks))

    async def _run_plugins_parallel(self, job: AnalysisJob) -> list[PluginExecutionResult]:
        tasks = [self._execute_plugin_safe(job, req) for req in job.plugins]
        return list(await asyncio.gather(*tasks))

    async def _execute_plugin_safe(
        self,
        job: AnalysisJob,
        request: PluginExecutionRequest,
    ) -> PluginExecutionResult:
        try:
            return await self._execute_plugin(job, request)
        except Exception as exc:
            logger.exception(
                "Plugin {} failed for symbol {}: {}",
                request.plugin_id,
                job.symbol_id,
                exc,
            )
            return PluginExecutionResult(
                plugin_id=request.plugin_id,
                plugin_version="unknown",
                parameters=request.parameters or {},
                params_hash=hash_parameters(request.parameters or {}),
                results=[],
                success=False,
                error=str(exc),
            )

    async def _execute_plugin(
        self,
        job: AnalysisJob,
        request: PluginExecutionRequest,
    ) -> PluginExecutionResult:
        plugin = self._registry.get(request.plugin_id)
        params = plugin.validate_parameters(request.parameters)

        if len(job.candles) < plugin.required_history():
            logger.warning(
                "Insufficient history for {}: have {}, need {}",
                request.plugin_id,
                len(job.candles),
                plugin.required_history(),
            )

        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(
            self._executor,
            partial(plugin.calculate, job.candles, params),
        )

        params_hash = hash_parameters(params)
        return PluginExecutionResult(
            plugin_id=plugin.plugin_id(),
            plugin_version=plugin.plugin_version(),
            parameters=params,
            params_hash=params_hash,
            results=results,
            success=True,
        )

    def resolve_dependencies(self, plugin_ids: list[str]) -> list[str]:
        """
        Topological ordering of plugins by dependencies (future-proof).

        Currently plugins have no dependencies; returns input order.
        """
        resolved: list[str] = []
        seen: set[str] = set()

        def visit(pid: str) -> None:
            if pid in seen:
                return
            plugin = self._registry.get(pid)
            for dep in plugin.dependencies:
                visit(dep)
            seen.add(pid)
            resolved.append(pid)

        for pid in plugin_ids:
            visit(pid)
        return resolved

    def list_plugins(self):
        return self._registry.list_metadata()

    def get_plugin_metadata(self, plugin_id: str):
        return self._registry.get_metadata(plugin_id)

    @staticmethod
    def build_job(
        *,
        symbol_id: str,
        timeframe_id: int,
        timeframe_code: str,
        candles: list,
        plugin_requests: list[PluginExecutionRequest],
        mode: ExecutionMode = ExecutionMode.BATCH,
    ) -> AnalysisJob:
        """Factory for constructing analysis jobs from any input source."""
        return AnalysisJob(
            symbol_id=symbol_id,
            timeframe_id=timeframe_id,
            timeframe_code=timeframe_code,
            candles=candles,
            plugins=plugin_requests,
            mode=mode,
        )
