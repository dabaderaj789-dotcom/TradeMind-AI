"""Symbol data access."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import NotFoundError
from app.domain.entities.symbol import Symbol as DomainSymbol
from app.models.exchange import Exchange
from app.models.symbol import Symbol
from app.repositories.base import BaseRepository


class SymbolRepository(BaseRepository[Symbol]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Symbol)

    async def get_by_id_with_relations(self, symbol_id: uuid.UUID) -> Symbol | None:
        stmt = (
            select(Symbol)
            .options(joinedload(Symbol.exchange), joinedload(Symbol.market))
            .where(Symbol.id == symbol_id)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_or_raise(self, symbol_id: uuid.UUID) -> Symbol:
        symbol = await self.get_by_id_with_relations(symbol_id)
        if symbol is None:
            raise NotFoundError("Symbol not found", detail=f"id={symbol_id}")
        return symbol

    async def get_by_exchange_and_code(self, exchange_id: uuid.UUID, symbol_code: str) -> Symbol | None:
        stmt = select(Symbol).where(
            Symbol.exchange_id == exchange_id,
            Symbol.symbol_code == symbol_code.upper(),
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_exchange_code_and_symbol(
        self, exchange_code: str, symbol_code: str
    ) -> Symbol | None:
        stmt = (
            select(Symbol)
            .join(Exchange, Symbol.exchange_id == Exchange.id)
            .options(joinedload(Symbol.exchange), joinedload(Symbol.market))
            .where(Exchange.code == exchange_code.lower(), Symbol.symbol_code == symbol_code.upper())
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_from_domain(
        self,
        domain_symbol: DomainSymbol,
        *,
        exchange_id: uuid.UUID,
        market_id: uuid.UUID,
    ) -> tuple[Symbol, bool]:
        """Insert or update symbol. Returns (symbol, created)."""
        existing = await self.get_by_exchange_and_code(exchange_id, domain_symbol.symbol_code)
        if existing:
            existing.name = domain_symbol.name
            existing.base_asset = domain_symbol.base_asset
            existing.quote_asset = domain_symbol.quote_asset
            existing.tick_size = domain_symbol.tick_size
            existing.lot_size = domain_symbol.lot_size
            existing.is_active = domain_symbol.is_active
            existing.metadata_ = domain_symbol.metadata
            await self._session.flush()
            return existing, False

        entity = Symbol(
            exchange_id=exchange_id,
            market_id=market_id,
            symbol_code=domain_symbol.symbol_code.upper(),
            name=domain_symbol.name,
            base_asset=domain_symbol.base_asset,
            quote_asset=domain_symbol.quote_asset,
            tick_size=domain_symbol.tick_size,
            lot_size=domain_symbol.lot_size,
            is_active=domain_symbol.is_active,
            metadata_=domain_symbol.metadata,
        )
        return await self.create(entity), True

    async def list_filtered(
        self,
        *,
        exchange_id: uuid.UUID | None = None,
        market_id: uuid.UUID | None = None,
        search: str | None = None,
        active_only: bool = True,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Symbol]:
        stmt = select(Symbol).options(joinedload(Symbol.exchange), joinedload(Symbol.market))

        if exchange_id is not None:
            stmt = stmt.where(Symbol.exchange_id == exchange_id)
        if market_id is not None:
            stmt = stmt.where(Symbol.market_id == market_id)
        if active_only:
            stmt = stmt.where(Symbol.is_active.is_(True))
        if search:
            pattern = f"%{search.upper()}%"
            stmt = stmt.where(
                or_(
                    Symbol.symbol_code.ilike(pattern),
                    Symbol.name.ilike(pattern),
                )
            )

        stmt = stmt.order_by(Symbol.symbol_code).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().unique().all())

    async def count_filtered(
        self,
        *,
        exchange_id: uuid.UUID | None = None,
        market_id: uuid.UUID | None = None,
        search: str | None = None,
        active_only: bool = True,
    ) -> int:
        stmt = select(func.count()).select_from(Symbol)

        if exchange_id is not None:
            stmt = stmt.where(Symbol.exchange_id == exchange_id)
        if market_id is not None:
            stmt = stmt.where(Symbol.market_id == market_id)
        if active_only:
            stmt = stmt.where(Symbol.is_active.is_(True))
        if search:
            pattern = f"%{search.upper()}%"
            stmt = stmt.where(
                or_(
                    Symbol.symbol_code.ilike(pattern),
                    Symbol.name.ilike(pattern),
                )
            )

        result = await self._session.execute(stmt)
        return result.scalar_one()
