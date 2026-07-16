"""Pydantic schemas for Analysis Engine API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class PluginMetadataResponse(BaseSchema):
    plugin_id: str
    plugin_name: str
    plugin_version: str
    category: str
    required_history: int
    default_parameters: dict[str, Any]
    output_schema: dict[str, Any]
    description: str = ""
    dependencies: list[str] = Field(default_factory=list)


class PluginExecutionSpec(BaseSchema):
    plugin_id: str
    parameters: dict[str, Any] | None = None


class ExecuteAnalysisRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str = Field(description="Canonical timeframe code, e.g. 1h")
    plugins: list[PluginExecutionSpec]
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=5000, ge=10, le=50000)
    persist: bool = Field(default=True, description="Store results in database")


class SymbolAnalysisResult(BaseSchema):
    plugin_id: str
    plugin_version: str
    parameters: dict[str, Any]
    params_hash: str
    success: bool
    bars_computed: int
    bars_persisted: int
    error: str | None = None


class ExecuteAnalysisResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    computed_at: datetime
    results: list[SymbolAnalysisResult]


class AnalysisResultBarResponse(BaseSchema):
    open_time: datetime
    plugin_id: str
    plugin_version: str
    params_hash: str
    values: dict[str, Any]
    computed_at: datetime


class AnalysisResultListResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    plugin_id: str | None = None
    items: list[AnalysisResultBarResponse]
    total: int
