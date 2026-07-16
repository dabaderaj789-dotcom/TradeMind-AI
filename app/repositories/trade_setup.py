"""Trade setup persistence."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.trade_setup.types import ScoredTradeSetup
from app.models.trade_setup import TradeSetup, TradeSetupRun
from app.repositories.base import BaseRepository


class TradeSetupRepository(BaseRepository[TradeSetup]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, TradeSetup)

    async def create_run(
        self,
        *,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        engine_version: str,
        params_hash: str,
        config: dict,
        analysis_snapshot: dict,
        setups_detected: int,
        bars_scanned: int,
        computed_at: datetime,
    ) -> TradeSetupRun:
        run = TradeSetupRun(
            symbol_id=symbol_id,
            timeframe_id=timeframe_id,
            engine_version=engine_version,
            params_hash=params_hash,
            config=config,
            analysis_snapshot=analysis_snapshot,
            setups_detected=setups_detected,
            bars_scanned=bars_scanned,
            computed_at=computed_at,
        )
        self._session.add(run)
        await self._session.flush()
        return run

    async def bulk_insert_setups(
        self,
        *,
        run_id: uuid.UUID,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        engine_version: str,
        params_hash: str,
        setups: list[ScoredTradeSetup],
    ) -> int:
        for setup in setups:
            self._session.add(
                TradeSetup(
                    setup_id=setup.setup_id,
                    run_id=run_id,
                    symbol_id=symbol_id,
                    timeframe_id=timeframe_id,
                    engine_version=engine_version,
                    params_hash=params_hash,
                    setup_type=setup.setup_type.value,
                    direction=setup.direction.value,
                    confidence_score=setup.confidence_score,
                    confidence_level=setup.confidence_level.value,
                    evidence_scores=setup.evidence_scores,
                    entry_zone=setup.entry_zone.to_dict(),
                    stop_loss_zone=setup.stop_loss_zone.to_dict(),
                    target_zones=[z.to_dict() for z in setup.target_zones],
                    risk_reward=setup.risk_reward,
                    status=setup.status.value,
                    explanation=setup.explanation,
                    reference_ids=setup.reference_ids,
                    detected_at=setup.detected_at,
                    expires_index=setup.expires_index,
                )
            )
        await self._session.flush()
        return len(setups)

    async def list_setups(
        self,
        *,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        status: str | None = None,
        setup_type: str | None = None,
        direction: str | None = None,
        min_confidence: float | None = None,
        engine_version: str | None = None,
        params_hash: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[TradeSetup]:
        stmt = select(TradeSetup).where(
            TradeSetup.symbol_id == symbol_id,
            TradeSetup.timeframe_id == timeframe_id,
        )
        if status:
            stmt = stmt.where(TradeSetup.status == status)
        if setup_type:
            stmt = stmt.where(TradeSetup.setup_type == setup_type)
        if direction:
            stmt = stmt.where(TradeSetup.direction == direction)
        if min_confidence is not None:
            stmt = stmt.where(TradeSetup.confidence_score >= min_confidence)
        if engine_version:
            stmt = stmt.where(TradeSetup.engine_version == engine_version)
        if params_hash:
            stmt = stmt.where(TradeSetup.params_hash == params_hash)

        stmt = stmt.order_by(desc(TradeSetup.detected_at)).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, setup_id: str) -> TradeSetup | None:
        stmt = select(TradeSetup).where(TradeSetup.setup_id == setup_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def count_setups(
        self,
        *,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        status: str | None = None,
    ) -> int:
        from sqlalchemy import func

        stmt = (
            select(func.count())
            .select_from(TradeSetup)
            .where(
                TradeSetup.symbol_id == symbol_id,
                TradeSetup.timeframe_id == timeframe_id,
            )
        )
        if status:
            stmt = stmt.where(TradeSetup.status == status)
        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def get_latest_run(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
    ) -> TradeSetupRun | None:
        stmt = (
            select(TradeSetupRun)
            .where(
                TradeSetupRun.symbol_id == symbol_id,
                TradeSetupRun.timeframe_id == timeframe_id,
            )
            .order_by(desc(TradeSetupRun.computed_at))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()
