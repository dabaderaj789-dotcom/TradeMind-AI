"""Analysis plugin persistence."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.analysis.types import PluginMetadata
from app.models.analysis import AnalysisPlugin
from app.repositories.base import BaseRepository


class AnalysisPluginRepository(BaseRepository[AnalysisPlugin]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, AnalysisPlugin)

    async def get_by_plugin_id(self, plugin_id: str) -> AnalysisPlugin | None:
        stmt = select(AnalysisPlugin).where(AnalysisPlugin.plugin_id == plugin_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_active(self) -> list[AnalysisPlugin]:
        stmt = (
            select(AnalysisPlugin)
            .where(AnalysisPlugin.is_active.is_(True))
            .order_by(AnalysisPlugin.category, AnalysisPlugin.plugin_id)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def upsert_from_metadata(self, metadata: PluginMetadata) -> AnalysisPlugin:
        existing = await self.get_by_plugin_id(metadata.plugin_id)
        if existing:
            existing.plugin_name = metadata.plugin_name
            existing.plugin_version = metadata.plugin_version
            existing.category = metadata.category
            existing.required_history = metadata.required_history
            existing.parameters_schema = metadata.default_parameters
            existing.output_schema = metadata.output_schema
            existing.description = metadata.description
            existing.dependencies = metadata.dependencies
            await self._session.flush()
            return existing

        entity = AnalysisPlugin(
            plugin_id=metadata.plugin_id,
            plugin_name=metadata.plugin_name,
            plugin_version=metadata.plugin_version,
            category=metadata.category,
            required_history=metadata.required_history,
            parameters_schema=metadata.default_parameters,
            output_schema=metadata.output_schema,
            description=metadata.description,
            dependencies=metadata.dependencies,
        )
        return await self.create(entity)

    async def sync_all(self, metadata_list: list[PluginMetadata]) -> int:
        count = 0
        for meta in metadata_list:
            await self.upsert_from_metadata(meta)
            count += 1
        return count
