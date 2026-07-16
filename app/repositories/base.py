"""Generic async repository base class for CRUD operations."""

import uuid
from typing import Generic, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.database.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """
    Generic async repository providing standard CRUD operations.

    Domain-specific repositories (e.g. IndicatorRepository, AlertRepository)
    inherit from this class and add specialized queries.
    """

    def __init__(self, session: AsyncSession, model: type[ModelT]) -> None:
        self._session = session
        self._model = model

    def _base_select(self) -> Select[tuple[ModelT]]:
        return select(self._model)

    async def get_by_id(self, entity_id: uuid.UUID) -> ModelT | None:
        """Fetch a single entity by primary key."""
        stmt = self._base_select().where(self._model.id == entity_id)  # type: ignore[attr-defined]
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_or_raise(self, entity_id: uuid.UUID) -> ModelT:
        """Fetch a single entity by primary key or raise NotFoundError."""
        entity = await self.get_by_id(entity_id)
        if entity is None:
            raise NotFoundError(
                f"{self._model.__name__} not found",
                detail=f"id={entity_id}",
            )
        return entity

    async def get_all(
        self,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ModelT]:
        """Fetch a paginated list of entities."""
        stmt = self._base_select().offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count(self) -> int:
        """Return total count of entities."""
        stmt = select(func.count()).select_from(self._model)
        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def create(self, entity: ModelT) -> ModelT:
        """Persist a new entity."""
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def update(self, entity: ModelT) -> ModelT:
        """Flush changes to an existing entity."""
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def delete(self, entity: ModelT) -> None:
        """Remove an entity from the database."""
        await self._session.delete(entity)
        await self._session.flush()
