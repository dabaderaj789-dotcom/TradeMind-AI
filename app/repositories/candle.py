"""Candle data access."""

import uuid
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candle import Candle
from app.repositories.base import BaseRepository


class CandleRepository(BaseRepository[Candle]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Candle)

    async def get_latest_open_time(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
    ) -> datetime | None:
        stmt = (
            select(Candle.open_time)
            .where(Candle.symbol_id == symbol_id, Candle.timeframe_id == timeframe_id)
            .order_by(desc(Candle.open_time))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_candles(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[Candle]:
        stmt = select(Candle).where(
            Candle.symbol_id == symbol_id,
            Candle.timeframe_id == timeframe_id,
        )

        if start is not None:
            stmt = stmt.where(Candle.open_time >= start)
        if end is not None:
            stmt = stmt.where(Candle.open_time <= end)

        stmt = stmt.order_by(Candle.open_time).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_candles(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> int:
        from sqlalchemy import func

        stmt = (
            select(func.count())
            .select_from(Candle)
            .where(Candle.symbol_id == symbol_id, Candle.timeframe_id == timeframe_id)
        )
        if start is not None:
            stmt = stmt.where(Candle.open_time >= start)
        if end is not None:
            stmt = stmt.where(Candle.open_time <= end)

        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def get_candles_for_analysis(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 10000,
    ) -> list[Candle]:
        """Fetch the newest `limit` candles in ascending time order for analysis.

        When `start`/`end` are omitted, returns the latest window (not the oldest
        bars in the table) so engines always see current market structure.
        """
        if start is None and end is None:
            return await self.get_latest(symbol_id, timeframe_id, limit=limit)
        return await self.get_candles(
            symbol_id,
            timeframe_id,
            start=start,
            end=end,
            limit=limit,
            offset=0,
        )

    async def get_latest(
        self,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        limit: int = 100,
    ) -> list[Candle]:
        stmt = (
            select(Candle)
            .where(Candle.symbol_id == symbol_id, Candle.timeframe_id == timeframe_id)
            .order_by(desc(Candle.open_time))
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        rows = list(result.scalars().all())
        rows.reverse()
        return rows
