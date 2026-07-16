"""Bulk candle persistence with idempotent upserts."""

import uuid
from decimal import Decimal

from loguru import logger
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities.candle import Candle
from app.models.candle import Candle as CandleModel


class CandleWriter:
    """Writes validated candles to PostgreSQL with duplicate skipping."""

    def __init__(self, session: AsyncSession, *, batch_size: int = 1000) -> None:
        self._session = session
        self._batch_size = batch_size

    async def bulk_insert(
        self,
        candles: list[Candle],
        *,
        symbol_id: uuid.UUID,
        timeframe_id: int,
    ) -> int:
        """Insert candles in batches. Returns count of rows attempted (excluding conflicts)."""
        if not candles:
            return 0

        inserted = 0
        for i in range(0, len(candles), self._batch_size):
            batch = candles[i : i + self._batch_size]
            rows = [
                {
                    "symbol_id": symbol_id,
                    "timeframe_id": timeframe_id,
                    "open_time": c.open_time,
                    "close_time": c.close_time,
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                    "quote_volume": c.quote_volume,
                    "trades_count": c.trades_count,
                    "is_complete": c.is_complete,
                    "source": c.source,
                }
                for c in batch
            ]

            stmt = insert(CandleModel).values(rows)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["symbol_id", "timeframe_id", "open_time"]
            )
            result = await self._session.execute(stmt)
            inserted += result.rowcount or 0

        await self._session.flush()
        logger.info(
            "Persisted candles: attempted={}, inserted={}",
            len(candles),
            inserted,
        )
        return inserted
