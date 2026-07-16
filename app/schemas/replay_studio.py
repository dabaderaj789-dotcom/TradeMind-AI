"""Pydantic schemas for Replay Studio API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class ReplaySessionCreateRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str = Field(..., description="Timeframe code e.g. 1h")
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=5000, ge=50, le=500_000)
    strategy_id: str | None = Field(default=None, description="Optional strategy for decisions overlay")
    initial_index: int = Field(default=0, ge=0)


class ReplaySessionResponse(BaseSchema):
    session_id: UUID
    symbol_id: UUID
    symbol_code: str
    timeframe: str
    total_bars: int
    current_index: int
    current_time: datetime | None
    playback_state: str
    replay_speed: float
    debug_mode: bool
    validation_mode: bool = False
    events_count: int
    engine_version: str


class ReplayFrameResponse(BaseSchema):
    session_id: UUID
    current_index: int
    total_bars: int
    current_time: datetime | None
    playback_state: str
    replay_speed: float
    candles: list[dict[str, Any]]
    overlays: dict[str, Any]
    visible_events: list[dict[str, Any]]


class ReplayStepRequest(BaseSchema):
    steps: int = Field(default=1, ge=1, le=500)


class ReplayJumpRequest(BaseSchema):
    index: int | None = Field(default=None, ge=0)
    open_time: datetime | None = None


class ReplayEventJumpRequest(BaseSchema):
    event_id: str | None = None
    direction: Literal["next", "previous"] = "next"


class ReplayPlaybackRequest(BaseSchema):
    playing: bool
    speed: float | None = Field(default=None, ge=0.25, le=32.0)


class ReplaySettingsRequest(BaseSchema):
    debug_mode: bool | None = None
    validation_mode: bool | None = None
    enabled_overlays: list[str] | None = None


class ReplayInspectorResponse(BaseSchema):
    session_id: UUID
    bar_index: int
    open_time: datetime
    candle: dict[str, Any]
    indicators: dict[str, Any]
    market_structure: dict[str, Any]
    smart_money: dict[str, Any]
    trade_setup: dict[str, Any] | None
    strategy_evaluation: dict[str, Any] | None
    confidence_scores: dict[str, float]
    evidence_breakdown: dict[str, float]
    reasoning: str | None


class ReplayEventResponse(BaseSchema):
    event_id: str
    event_type: str
    bar_index: int
    open_time: datetime
    label: str
    direction: str | None = None
    price: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReplayEventsListResponse(BaseSchema):
    session_id: UUID
    items: list[ReplayEventResponse]
    total: int


class ReplayDebugResponse(BaseSchema):
    session_id: UUID
    debug_mode: bool
    current_index: int
    open_time: datetime | None
    execution_order: list[str]
    params_hashes: dict[str, str]
    raw_plugin_outputs: dict[str, Any]
    json_payloads: dict[str, Any]


class ReplayMetricsResponse(BaseSchema):
    session_id: UUID
    metrics: dict[str, Any]
    tick_interval_ms: int


class ReplayPlaybackHintResponse(BaseSchema):
    session_id: UUID
    playback_state: str
    replay_speed: float
    tick_interval_ms: int
    current_index: int
    total_bars: int
