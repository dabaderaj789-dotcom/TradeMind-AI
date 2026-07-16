"""Pydantic schemas for Order Block API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class OrderBlockExecuteRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str
    parameters: dict[str, Any] | None = None
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=10000, ge=40, le=1_000_000)
    persist: bool = True


class OrderBlockExecuteResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    computed_at: datetime
    bars_computed: int
    bars_persisted: int
    plugin_version: str
    params_hash: str


class OrderBlockRecord(BaseSchema):
    order_block_id: str
    type: str
    zone_high: float
    zone_low: float
    status: str
    mitigation_state: str
    touch_count: int
    strength_score: float
    strength_components: dict[str, float]
    confidence: float
    explanation: str
    created_at: datetime
    timeframe_code: str
    invalidation_at: datetime | None = None
    invalidation_reason: str | None = None


class OrderBlockListResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    as_of: datetime | None = None
    items: list[OrderBlockRecord]
    total: int


class OrderBlockResultBar(BaseSchema):
    open_time: datetime
    values: dict[str, Any]
    computed_at: datetime


class OrderBlockResultsResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    items: list[OrderBlockResultBar]
    total: int
