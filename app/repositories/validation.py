"""Setup validation review persistence."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.validation import SetupValidationReview
from app.repositories.base import BaseRepository


class ValidationFilter:
    def __init__(
        self,
        *,
        symbol_id: uuid.UUID | None = None,
        timeframe_id: int | None = None,
        strategy_id: str | None = None,
        setup_type: str | None = None,
        verdict: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> None:
        self.symbol_id = symbol_id
        self.timeframe_id = timeframe_id
        self.strategy_id = strategy_id
        self.setup_type = setup_type
        self.verdict = verdict
        self.start = start
        self.end = end
        self.limit = limit
        self.offset = offset


class ValidationRepository(BaseRepository[SetupValidationReview]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SetupValidationReview)

    def _apply_filters(self, stmt, flt: ValidationFilter):
        if flt.symbol_id:
            stmt = stmt.where(SetupValidationReview.symbol_id == flt.symbol_id)
        if flt.timeframe_id:
            stmt = stmt.where(SetupValidationReview.timeframe_id == flt.timeframe_id)
        if flt.strategy_id:
            stmt = stmt.where(SetupValidationReview.strategy_id == flt.strategy_id)
        if flt.setup_type:
            stmt = stmt.where(SetupValidationReview.setup_type == flt.setup_type)
        if flt.verdict:
            stmt = stmt.where(SetupValidationReview.verdict == flt.verdict)
        if flt.start:
            stmt = stmt.where(SetupValidationReview.detected_at >= flt.start)
        if flt.end:
            stmt = stmt.where(SetupValidationReview.detected_at <= flt.end)
        return stmt

    async def upsert_review(self, data: dict) -> SetupValidationReview:
        stmt = insert(SetupValidationReview).values(**data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["setup_id"],
            set_={
                "verdict": stmt.excluded.verdict,
                "rejection_reason": stmt.excluded.rejection_reason,
                "plugin_issues": stmt.excluded.plugin_issues,
                "notes": stmt.excluded.notes,
                "reviewer": stmt.excluded.reviewer,
                "replay_session_id": stmt.excluded.replay_session_id,
                "reviewed_at": stmt.excluded.reviewed_at,
                "updated_at": stmt.excluded.updated_at,
            },
        ).returning(SetupValidationReview)
        result = await self._session.execute(stmt)
        row = result.scalar_one()
        await self._session.flush()
        return row

    async def get_by_setup_id(self, setup_id: str) -> SetupValidationReview | None:
        stmt = select(SetupValidationReview).where(SetupValidationReview.setup_id == setup_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_reviews(self, flt: ValidationFilter) -> list[SetupValidationReview]:
        stmt = select(SetupValidationReview)
        stmt = self._apply_filters(stmt, flt)
        stmt = stmt.order_by(desc(SetupValidationReview.reviewed_at)).offset(flt.offset).limit(flt.limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_reviews(self, flt: ValidationFilter) -> int:
        from sqlalchemy import func

        stmt = select(func.count()).select_from(SetupValidationReview)
        stmt = self._apply_filters(stmt, flt)
        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def get_reviews_for_setups(self, setup_ids: list[str]) -> dict[str, SetupValidationReview]:
        if not setup_ids:
            return {}
        stmt = select(SetupValidationReview).where(SetupValidationReview.setup_id.in_(setup_ids))
        result = await self._session.execute(stmt)
        return {r.setup_id: r for r in result.scalars().all()}

    async def list_for_export(self, flt: ValidationFilter) -> list[SetupValidationReview]:
        flt.limit = min(flt.limit, 50_000)
        return await self.list_reviews(flt)
