"""Market data ingestion and retrieval service."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.base import ExchangeAdapter
from app.adapters.registry import AdapterRegistry
from app.core.exceptions import NotFoundError, ValidationError as AppValidationError
from app.domain.value_objects.timeframe import parse_timeframe
from app.pipeline.validator import CandleValidator
from app.pipeline.writer import CandleWriter
from app.repositories.candle import CandleRepository
from app.repositories.exchange import ExchangeRepository
from app.repositories.market import MarketRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.market_data import (
    CandleListResponse,
    CandleResponse,
    DownloadCandlesResponse,
    ExchangeResponse,
    PaginatedExchangeResponse,
    PaginatedSymbolResponse,
    SyncSymbolsResponse,
    SymbolResponse,
)


@dataclass
class MarketDataService:
    """Orchestrates symbol sync, historical download, and candle retrieval."""

    session: AsyncSession
    adapter_registry: AdapterRegistry
    validator: CandleValidator | None = None

    def __post_init__(self) -> None:
        if self.validator is None:
            self.validator = CandleValidator()

    def _exchange_repo(self) -> ExchangeRepository:
        return ExchangeRepository(self.session)

    def _symbol_repo(self) -> SymbolRepository:
        return SymbolRepository(self.session)

    def _candle_repo(self) -> CandleRepository:
        return CandleRepository(self.session)

    def _timeframe_repo(self) -> TimeframeRepository:
        return TimeframeRepository(self.session)

    def _market_repo(self) -> MarketRepository:
        return MarketRepository(self.session)

    async def list_exchanges(self, *, page: int = 1, page_size: int = 50) -> PaginatedExchangeResponse:
        repo = self._exchange_repo()
        offset = (page - 1) * page_size
        items = await repo.list_active(offset=offset, limit=page_size)
        total = await repo.count_active()
        pages = max(1, (total + page_size - 1) // page_size)
        return PaginatedExchangeResponse(
            items=[self._to_exchange_response(e) for e in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
        )

    async def list_symbols(
        self,
        *,
        exchange_code: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 50,
        active_only: bool = True,
    ) -> PaginatedSymbolResponse:
        repo = self._symbol_repo()
        exchange_id = None
        if exchange_code:
            exchange = await self._exchange_repo().get_by_code(exchange_code)
            if exchange is None:
                raise NotFoundError("Exchange not found", detail=f"code={exchange_code}")
            exchange_id = exchange.id

        offset = (page - 1) * page_size
        items = await repo.list_filtered(
            exchange_id=exchange_id,
            search=search,
            active_only=active_only,
            offset=offset,
            limit=page_size,
        )
        total = await repo.count_filtered(
            exchange_id=exchange_id,
            search=search,
            active_only=active_only,
        )
        pages = max(1, (total + page_size - 1) // page_size)
        return PaginatedSymbolResponse(
            items=[self._to_symbol_response(s) for s in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
        )

    async def sync_symbols(self, exchange_code: str) -> SyncSymbolsResponse:
        adapter = self.adapter_registry.get(exchange_code)
        exchange = await self._exchange_repo().get_by_code(exchange_code)
        if exchange is None:
            raise NotFoundError("Exchange not found in database", detail=f"code={exchange_code}")

        market = await self._resolve_market_for_adapter(adapter)
        symbol_repo = self._symbol_repo()

        created = 0
        updated = 0
        total = 0

        async for domain_symbol in adapter.list_symbols(active_only=True):
            total += 1
            _, was_created = await symbol_repo.upsert_from_domain(
                domain_symbol,
                exchange_id=exchange.id,
                market_id=market.id,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        logger.info(
            "Symbol sync complete for {}: fetched={}, created={}, updated={}",
            exchange_code,
            total,
            created,
            updated,
        )
        return SyncSymbolsResponse(
            exchange_code=exchange_code,
            total_fetched=total,
            created=created,
            updated=updated,
        )

    async def download_candles(
        self,
        *,
        timeframe_code: str,
        symbol_id: uuid.UUID | None = None,
        exchange_code: str | None = None,
        symbol_code: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        incremental: bool = True,
    ) -> DownloadCandlesResponse:
        symbol = await self._resolve_symbol(symbol_id, exchange_code, symbol_code)
        timeframe = await self._timeframe_repo().get_by_code_or_raise(timeframe_code)
        tf = parse_timeframe(timeframe.code)

        adapter = self.adapter_registry.get(symbol.exchange.code)
        end_time = end or datetime.now(UTC)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=UTC)

        start_time = start
        if incremental and start_time is None:
            latest = await self._candle_repo().get_latest_open_time(symbol.id, timeframe.id)
            if latest is not None:
                start_time = latest + timedelta(seconds=timeframe.seconds)
            else:
                start_time = end_time - timedelta(days=_default_lookback_days(symbol.exchange.code, timeframe.code))

        if start_time is None:
            start_time = end_time - timedelta(days=_default_lookback_days(symbol.exchange.code, timeframe.code))

        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=UTC)

        if start_time >= end_time:
            raise AppValidationError(
                "Invalid date range",
                detail="start must be before end, or no new data to download",
            )

        logger.info(
            "Downloading {} {} {} from {} to {} (incremental={})",
            symbol.exchange.code,
            symbol.symbol_code,
            timeframe.code,
            start_time.isoformat(),
            end_time.isoformat(),
            incremental,
        )

        raw_candles = await adapter.get_historical_data(
            symbol.symbol_code,
            tf,
            start_time,
            end_time,
        )

        validation = self.validator.validate_batch(raw_candles)
        writer = CandleWriter(self.session)
        inserted = await writer.bulk_insert(
            validation.valid_candles,
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
        )

        return DownloadCandlesResponse(
            symbol_id=symbol.id,
            symbol_code=symbol.symbol_code,
            exchange_code=symbol.exchange.code,
            timeframe=timeframe.code,
            downloaded=len(raw_candles),
            inserted=inserted,
            rejected=validation.rejected_count,
            start=start_time,
            end=end_time,
            incremental=incremental,
        )

    async def get_candles(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 500,
        latest: bool = False,
    ) -> CandleListResponse:
        symbol = await self._symbol_repo().get_by_id_or_raise(symbol_id)
        timeframe = await self._timeframe_repo().get_by_code_or_raise(timeframe_code)

        if latest:
            rows = await self._candle_repo().get_latest(symbol.id, timeframe.id, limit=limit)
            total = len(rows)
        else:
            rows = await self._candle_repo().get_candles(
                symbol.id,
                timeframe.id,
                start=start,
                end=end,
                limit=limit,
            )
            total = await self._candle_repo().count_candles(
                symbol.id,
                timeframe.id,
                start=start,
                end=end,
            )

        return CandleListResponse(
            items=[
                CandleResponse(
                    symbol_id=symbol.id,
                    symbol_code=symbol.symbol_code,
                    timeframe=timeframe.code,
                    open_time=c.open_time,
                    close_time=c.close_time,
                    open=c.open,
                    high=c.high,
                    low=c.low,
                    close=c.close,
                    volume=c.volume,
                    quote_volume=c.quote_volume,
                    trades_count=c.trades_count,
                    is_complete=c.is_complete,
                    source=c.source,
                )
                for c in rows
            ],
            total=total,
            symbol_id=symbol.id,
            timeframe=timeframe.code,
        )

    async def _resolve_symbol(
        self,
        symbol_id: uuid.UUID | None,
        exchange_code: str | None,
        symbol_code: str | None,
    ):
        if symbol_id is not None:
            return await self._symbol_repo().get_by_id_or_raise(symbol_id)

        if exchange_code and symbol_code:
            symbol = await self._symbol_repo().get_by_exchange_code_and_symbol(
                exchange_code, symbol_code
            )
            if symbol is None:
                raise NotFoundError(
                    "Symbol not found",
                    detail=f"exchange={exchange_code}, symbol={symbol_code}",
                )
            return symbol

        raise AppValidationError(
            "Symbol identification required",
            detail="Provide symbol_id or (exchange_code + symbol_code)",
        )

    async def _resolve_market_for_adapter(self, adapter: ExchangeAdapter):
        market_type = adapter.market_types[0].value
        market_code = f"{adapter.exchange_code}_{market_type}"
        market = await self._market_repo().get_by_code(market_code)
        if market is None:
            raise NotFoundError("Market not found", detail=f"code={market_code}")
        return market

    @staticmethod
    def _to_exchange_response(exchange) -> ExchangeResponse:
        return ExchangeResponse(
            id=exchange.id,
            code=exchange.code,
            name=exchange.name,
            country=exchange.country,
            timezone=exchange.timezone,
            market_types=list(exchange.market_types),
            is_active=exchange.is_active,
        )

    @staticmethod
    def _to_symbol_response(symbol) -> SymbolResponse:
        return SymbolResponse(
            id=symbol.id,
            exchange_code=symbol.exchange.code,
            exchange_name=symbol.exchange.name,
            market_code=symbol.market.code,
            market_type=symbol.market.market_type,
            symbol_code=symbol.symbol_code,
            name=symbol.name,
            base_asset=symbol.base_asset,
            quote_asset=symbol.quote_asset,
            tick_size=symbol.tick_size,
            lot_size=symbol.lot_size,
            is_active=symbol.is_active,
        )


def _default_lookback_days(exchange_code: str, timeframe_code: str) -> int:
    """First-fill lookback — NSE needs longer windows than crypto defaults."""
    if exchange_code.lower() == "nse":
        from app.adapters.nse.constants import NSE_LOOKBACK_DAYS

        return NSE_LOOKBACK_DAYS.get(timeframe_code, 90)
    # Binance / default
    return {
        "1m": 3,
        "5m": 7,
        "15m": 30,
        "1h": 30,
        "4h": 60,
        "1d": 90,
        "1w": 365,
    }.get(timeframe_code, 30)
