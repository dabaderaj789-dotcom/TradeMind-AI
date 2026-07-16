"""Pydantic schemas for Liquidity Sweep API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class LiquiditySweepExecuteRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str
    parameters: dict[str, Any] | None = None
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=10000, ge=40, le=1_000_000)
    persist: bool = True


class LiquiditySweepExecuteResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    computed_at: datetime
    bars_computed: int
    bars_persisted: int
    plugin_version: str
    params_hash: str


class LiquiditySweepRecord(BaseSchema):
    sweep_id: str
    type: str
    sweep_level: float
    level_type: str
    penetration_depth: float
    status: str
    strength_score: float
    strength_components: dict[str, float]
    confirmation_components: dict[str, float]
    confidence: float
    explanation: str
    created_at: datetime
    timeframe_code: str
    trend: str = "sideways"
    market_phase: str = "ranging"
    related_order_block_id: str | None = None
    related_fvg_id: str | None = None
    associated_bos: dict[str, Any] | None = None
    associated_choch: dict[str, Any] | None = None
    nearest_swing_index: int | None = None
    nearest_swing_price: float | None = None
    lifecycle_events: list[dict[str, Any]] = Field(default_factory=list)
    confirmed_at: datetime | None = None
    failed_at: datetime | None = None
    invalidated_at: datetime | None = None


class LiquiditySweepListResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    as_of: datetime | None = None
    items: list[LiquiditySweepRecord]
    total: int


class LiquiditySweepDetailResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    item: LiquiditySweepRecord


class LiquiditySweepResultBar(BaseSchema):
    open_time: datetime
    values: dict[str, Any]
    computed_at: datetime


class LiquiditySweepResultsResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    items: list[LiquiditySweepResultBar]
    total: int
