"""Pydantic schemas for Fair Value Gap API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class FvgExecuteRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str
    parameters: dict[str, Any] | None = None
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=10000, ge=30, le=1_000_000)
    persist: bool = True


class FvgExecuteResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    computed_at: datetime
    bars_computed: int
    bars_persisted: int
    plugin_version: str
    params_hash: str


class FvgRecord(BaseSchema):
    fvg_id: str
    type: str
    gap_high: float
    gap_low: float
    gap_size: float
    gap_percent: float
    status: str
    fill_state: str
    fill_percentage: float
    quality_score: float
    quality_components: dict[str, float]
    confidence: float
    explanation: str
    created_at: datetime
    timeframe_code: str
    trend: str = "sideways"
    market_phase: str = "ranging"
    associated_order_block_id: str | None = None
    associated_bos: dict[str, Any] | None = None
    associated_choch: dict[str, Any] | None = None
    first_touch_at: datetime | None = None
    full_fill_at: datetime | None = None
    invalidation_at: datetime | None = None
    invalidation_reason: str | None = None


class FvgListResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    as_of: datetime | None = None
    items: list[FvgRecord]
    total: int


class FvgResultBar(BaseSchema):
    open_time: datetime
    values: dict[str, Any]
    computed_at: datetime


class FvgResultsResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    items: list[FvgResultBar]
    total: int
