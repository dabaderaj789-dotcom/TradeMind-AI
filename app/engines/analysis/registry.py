"""Analysis plugin registry with self-registration support."""

from __future__ import annotations

from typing import TypeVar

from loguru import logger

from app.core.exceptions import NotFoundError
from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.types import PluginMetadata

T = TypeVar("T", bound=BaseAnalysisPlugin)


class AnalysisPluginRegistry:
    """Discovers, registers, and resolves analysis plugins."""

    def __init__(self) -> None:
        self._plugins: dict[str, BaseAnalysisPlugin] = {}

    def register(self, plugin: BaseAnalysisPlugin | type[BaseAnalysisPlugin]) -> None:
        instance = plugin() if isinstance(plugin, type) else plugin
        plugin_id = instance.plugin_id()
        if plugin_id in self._plugins:
            logger.debug("Replacing analysis plugin registration: {}", plugin_id)
        instance.on_register()
        self._plugins[plugin_id] = instance
        logger.info(
            "Registered analysis plugin: {} v{} [{}]",
            plugin_id,
            instance.plugin_version(),
            instance.category().value,
        )

    def get(self, plugin_id: str) -> BaseAnalysisPlugin:
        plugin = self._plugins.get(plugin_id)
        if plugin is None:
            raise NotFoundError("Analysis plugin not found", detail=f"plugin_id={plugin_id}")
        return plugin

    def list_plugins(self) -> list[BaseAnalysisPlugin]:
        return sorted(self._plugins.values(), key=lambda p: p.plugin_id())

    def list_metadata(self) -> list[PluginMetadata]:
        return [p.metadata() for p in self.list_plugins()]

    def get_metadata(self, plugin_id: str) -> PluginMetadata:
        return self.get(plugin_id).metadata()

    def plugin_ids(self) -> list[str]:
        return sorted(self._plugins.keys())


_registry: AnalysisPluginRegistry | None = None


def get_analysis_registry() -> AnalysisPluginRegistry:
    global _registry
    if _registry is None:
        _registry = init_analysis_plugins()
    return _registry


def register_plugin(cls: type[T]) -> type[T]:
    """Decorator for self-registration of analysis plugins."""
    registry = get_analysis_registry()
    registry.register(cls)
    return cls


def init_analysis_plugins() -> AnalysisPluginRegistry:
    """Initialize registry and import built-in plugins."""
    global _registry
    registry = AnalysisPluginRegistry()
    _registry = registry

    # Import triggers @register_plugin decorators
    from app.engines.analysis.plugins import register_builtin_plugins  # noqa: PLC0415

    register_builtin_plugins(registry)
    return registry
