"""Timeframe data access."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.timeframe import Timeframe
from app.repositories.base import BaseRepository


class TimeframeRepository(BaseRepository[Timeframe]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Timeframe)

    async def get_by_id(self, timeframe_id: int) -> Timeframe | None:
        stmt = select(Timeframe).where(Timeframe.id == timeframe_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Timeframe | None:
        stmt = select(Timeframe).where(Timeframe.code == code.lower())
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_code_or_raise(self, code: str) -> Timeframe:
        tf = await self.get_by_code(code)
        if tf is None:
            raise NotFoundError("Timeframe not found", detail=f"code={code}")
        return tf

    async def list_all_ordered(self) -> list[Timeframe]:
        stmt = select(Timeframe).order_by(Timeframe.sort_order)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
