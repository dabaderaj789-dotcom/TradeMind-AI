"""Analysis result persistence."""

import uuid
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.analysis.serialize import has_meaningful_values, serialize_analysis_values
from app.engines.analysis.types import PluginExecutionResult
from app.models.analysis_result import AnalysisResult
from app.repositories.base import BaseRepository


class AnalysisResultRepository(BaseRepository[AnalysisResult]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, AnalysisResult)

    async def bulk_insert_results(
        self,
        *,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        plugin_result: PluginExecutionResult,
        computed_at: datetime,
    ) -> int:
        """Insert analysis bars; skip duplicates (idempotent per version+params)."""
        if not plugin_result.success or not plugin_result.results:
            return 0

        rows = []
        for bar in plugin_result.results:
            if not has_meaningful_values(bar.values):
                continue
            serializable = serialize_analysis_values(bar.values)
            rows.append(
                {
                    "symbol_id": symbol_id,
                    "timeframe_id": timeframe_id,
                    "open_time": bar.open_time,
                    "plugin_id": plugin_result.plugin_id,
                    "plugin_version": plugin_result.plugin_version,
                    "params_hash": plugin_result.params_hash,
                    "values": serializable,
                    "computed_at": computed_at,
                }
            )

        if not rows:
            return 0

        inserted = 0
        batch_size = 1000
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            stmt = insert(AnalysisResult).values(batch)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=[
                    "symbol_id",
                    "timeframe_id",
                    "open_time",
                    "plugin_id",
                    "plugin_version",
                    "params_hash",
                ]
            )
            result = await self._session.execute(stmt)
            inserted += result.rowcount or 0

        await self._session.flush()
        return inserted

    async def get_results(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        *,
        plugin_id: str | None = None,
        plugin_version: str | None = None,
        params_hash: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[AnalysisResult]:
        stmt = select(AnalysisResult).where(
            AnalysisResult.symbol_id == symbol_id,
            AnalysisResult.timeframe_id == timeframe_id,
        )
        if plugin_id:
            stmt = stmt.where(AnalysisResult.plugin_id == plugin_id)
        if plugin_version:
            stmt = stmt.where(AnalysisResult.plugin_version == plugin_version)
        if params_hash:
            stmt = stmt.where(AnalysisResult.params_hash == params_hash)
        if start:
            stmt = stmt.where(AnalysisResult.open_time >= start)
        if end:
            stmt = stmt.where(AnalysisResult.open_time <= end)

        stmt = stmt.order_by(AnalysisResult.open_time).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_latest_result(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        *,
        plugin_id: str,
        params_hash: str | None = None,
    ) -> AnalysisResult | None:
        stmt = (
            select(AnalysisResult)
            .where(
                AnalysisResult.symbol_id == symbol_id,
                AnalysisResult.timeframe_id == timeframe_id,
                AnalysisResult.plugin_id == plugin_id,
            )
            .order_by(desc(AnalysisResult.open_time))
            .limit(1)
        )
        if params_hash:
            stmt = stmt.where(AnalysisResult.params_hash == params_hash)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_params_hash(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        plugin_id: str,
    ) -> str | None:
        stmt = (
            select(AnalysisResult.params_hash)
            .where(
                AnalysisResult.symbol_id == symbol_id,
                AnalysisResult.timeframe_id == timeframe_id,
                AnalysisResult.plugin_id == plugin_id,
            )
            .order_by(desc(AnalysisResult.computed_at))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def count_results(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        *,
        plugin_id: str | None = None,
        params_hash: str | None = None,
    ) -> int:
        from sqlalchemy import func

        stmt = (
            select(func.count())
            .select_from(AnalysisResult)
            .where(
                AnalysisResult.symbol_id == symbol_id,
                AnalysisResult.timeframe_id == timeframe_id,
            )
        )
        if plugin_id:
            stmt = stmt.where(AnalysisResult.plugin_id == plugin_id)
        if params_hash:
            stmt = stmt.where(AnalysisResult.params_hash == params_hash)
        result = await self._session.execute(stmt)
        return result.scalar_one()
