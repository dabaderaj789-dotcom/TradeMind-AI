"""Exchange data access."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exchange import Exchange
from app.repositories.base import BaseRepository


class ExchangeRepository(BaseRepository[Exchange]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Exchange)

    async def get_by_code(self, code: str) -> Exchange | None:
        stmt = select(Exchange).where(Exchange.code == code.lower())
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_active(self, *, offset: int = 0, limit: int = 100) -> list[Exchange]:
        stmt = (
            select(Exchange)
            .where(Exchange.is_active.is_(True))
            .order_by(Exchange.code)
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_active(self) -> int:
        from sqlalchemy import func

        stmt = select(func.count()).select_from(Exchange).where(Exchange.is_active.is_(True))
        result = await self._session.execute(stmt)
        return result.scalar_one()
