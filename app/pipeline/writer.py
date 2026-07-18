"""Bulk candle persistence with tip-refresh upserts."""

import uuid
from decimal import Decimal

from loguru import logger
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities.candle import Candle
from app.models.candle import Candle as CandleModel


class CandleWriter:
    """Writes validated candles to PostgreSQL.

    Conflicts update OHLC so the open tip bar stays in sync with the exchange
    (insert-only previously froze the tip mid-bar forever).
    """

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
        """Upsert candles in batches. Returns rows inserted or updated."""
        if not candles:
            return 0

        written = 0
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
            stmt = stmt.on_conflict_do_update(
                index_elements=["symbol_id", "timeframe_id", "open_time"],
                set_={
                    "close_time": stmt.excluded.close_time,
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                    "quote_volume": stmt.excluded.quote_volume,
                    "trades_count": stmt.excluded.trades_count,
                    "is_complete": stmt.excluded.is_complete,
                    "source": stmt.excluded.source,
                },
            )
            result = await self._session.execute(stmt)
            written += result.rowcount or 0

        await self._session.flush()
        logger.info(
            "Persisted candles: attempted={}, written={}",
            len(candles),
            written,
        )
        return written
