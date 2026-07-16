"""Pydantic schemas for Market Structure API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class MarketStructureExecuteRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str
    parameters: dict[str, Any] | None = None
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=10000, ge=30, le=1_000_000)
    persist: bool = True


class MarketStructureExecuteResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    computed_at: datetime
    bars_computed: int
    bars_persisted: int
    plugin_version: str
    params_hash: str


class TrendResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    as_of: datetime
    trend: str
    market_phase: str
    phase_confidence: float
    confidence: float


class DynamicLevelResponse(BaseSchema):
    price: float
    strength: float
    touches: int
    created_at: datetime
    last_validated_at: datetime


class LevelsResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    as_of: datetime
    support_levels: list[DynamicLevelResponse]
    resistance_levels: list[DynamicLevelResponse]


class StructureEventResponse(BaseSchema):
    event_type: str
    broken_swing_price: float
    break_price: float
    break_time: datetime
    open_time: datetime


class StructureEventsResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    bos_events: list[StructureEventResponse]
    choch_events: list[StructureEventResponse]
    total: int


class MarketStructureResultBar(BaseSchema):
    open_time: datetime
    values: dict[str, Any]
    computed_at: datetime


class MarketStructureResultsResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    items: list[MarketStructureResultBar]
    total: int
