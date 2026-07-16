"""Base class for all analysis plugins."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import BaseModel, ValidationError as PydanticValidationError

from app.core.exceptions import ValidationError as AppValidationError
from app.engines.analysis.types import (
    AnalysisBarResult,
    AnalysisCategory,
    CandleBar,
    PluginMetadata,
)


class BaseAnalysisPlugin(ABC):
    """Abstract base for trend, momentum, volatility, volume, and future analysis plugins."""

    # Optional plugin dependencies (plugin_ids) — reserved for future resolution
    dependencies: ClassVar[list[str]] = []

    @classmethod
    @abstractmethod
    def plugin_id(cls) -> str:
        """Unique stable identifier, e.g. 'rsi', 'ema'."""

    @classmethod
    @abstractmethod
    def plugin_name(cls) -> str:
        """Human-readable name."""

    @classmethod
    def plugin_version(cls) -> str:
        """Semantic version of plugin implementation."""
        return "1.0.0"

    @classmethod
    @abstractmethod
    def category(cls) -> AnalysisCategory:
        """Analysis category for grouping and discovery."""

    @classmethod
    @abstractmethod
    def required_history(cls) -> int:
        """Minimum candle count required for meaningful output."""

    @classmethod
    @abstractmethod
    def default_parameters(cls) -> dict[str, Any]:
        """Default parameter values."""

    @classmethod
    @abstractmethod
    def parameters_model(cls) -> type[BaseModel]:
        """Pydantic model for parameter validation."""

    @classmethod
    @abstractmethod
    def output_schema(cls) -> dict[str, Any]:
        """JSON-schema-like description of output value keys."""

    @classmethod
    def description(cls) -> str:
        return f"{cls.plugin_name()} analysis plugin"

    @classmethod
    def metadata(cls) -> PluginMetadata:
        """Full plugin metadata for API and registry sync."""
        return PluginMetadata(
            plugin_id=cls.plugin_id(),
            plugin_name=cls.plugin_name(),
            plugin_version=cls.plugin_version(),
            category=cls.category().value,
            required_history=cls.required_history(),
            default_parameters=cls.default_parameters(),
            output_schema=cls.output_schema(),
            description=cls.description(),
            dependencies=list(cls.dependencies),
        )

    def validate_parameters(self, parameters: dict[str, Any] | None) -> dict[str, Any]:
        """Validate and merge parameters with defaults."""
        merged = {**self.default_parameters(), **(parameters or {})}
        try:
            model = self.parameters_model()
            validated = model.model_validate(merged)
            return validated.model_dump()
        except PydanticValidationError as exc:
            raise AppValidationError(
                f"Invalid parameters for {self.plugin_id()}",
                detail=str(exc.errors()),
            ) from exc

    @abstractmethod
    def calculate(
        self,
        candles: list[CandleBar],
        parameters: dict[str, Any],
    ) -> list[AnalysisBarResult]:
        """Compute analysis values aligned to input candles."""

    def on_register(self) -> None:
        """Hook called when plugin is registered with the engine."""
