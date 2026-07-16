"""Analysis engine types and data structures."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any


class AnalysisCategory(StrEnum):
    TREND = "trend"
    MOMENTUM = "momentum"
    VOLATILITY = "volatility"
    VOLUME = "volume"
    MARKET_STRUCTURE = "market_structure"
    SMART_MONEY = "smart_money"
    CANDLESTICK = "candlestick"
    AI_FEATURES = "ai_features"


class ExecutionMode(StrEnum):
    """How analysis input is supplied — supports batch, live, and replay."""

    BATCH = "batch"
    LIVE = "live"
    REPLAY = "replay"


@dataclass(frozen=True, slots=True)
class CandleBar:
    """Standardized OHLCV input for all analysis plugins."""

    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: datetime | None = None


@dataclass(frozen=True, slots=True)
class AnalysisBarResult:
    """Single-bar analysis output aligned to a candle timestamp."""

    open_time: datetime
    values: dict[str, Any]


@dataclass(frozen=True, slots=True)
class PluginMetadata:
    """Public metadata describing an analysis plugin."""

    plugin_id: str
    plugin_name: str
    plugin_version: str
    category: str
    required_history: int
    default_parameters: dict[str, Any]
    output_schema: dict[str, Any]
    description: str = ""
    dependencies: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class PluginExecutionRequest:
    """Request to run a single plugin on a candle series."""

    plugin_id: str
    parameters: dict[str, Any]


@dataclass
class AnalysisJob:
    """A unit of work: one symbol, timeframe, and set of plugin requests."""

    symbol_id: str
    timeframe_id: int
    timeframe_code: str
    candles: list[CandleBar]
    plugins: list[PluginExecutionRequest]
    mode: ExecutionMode = ExecutionMode.BATCH


@dataclass
class PluginExecutionResult:
    """Result of executing one plugin — success or isolated failure."""

    plugin_id: str
    plugin_version: str
    parameters: dict[str, Any]
    params_hash: str
    results: list[AnalysisBarResult]
    success: bool
    error: str | None = None


@dataclass
class AnalysisJobResult:
    """Aggregated results for an analysis job."""

    symbol_id: str
    timeframe_id: int
    timeframe_code: str
    mode: ExecutionMode
    plugin_results: list[PluginExecutionResult]
    computed_at: datetime
