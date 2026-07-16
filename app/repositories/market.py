"""Market data access."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import Market
from app.repositories.base import BaseRepository


class MarketRepository(BaseRepository[Market]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Market)

    async def get_by_code(self, code: str) -> Market | None:
        stmt = select(Market).where(Market.code == code)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()
