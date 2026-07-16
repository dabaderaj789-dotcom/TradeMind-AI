"""Pydantic schemas for Trade Setup API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class TradeSetupExecuteRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str
    parameters: dict[str, Any] | None = None
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=10000, ge=50, le=1_000_000)
    incremental: bool = Field(
        default=False,
        description="Scan only recent bars (uses scan_bars from parameters)",
    )
    ensure_analysis: bool = Field(
        default=False,
        description="Run missing source plugins before detection (default: use stored only)",
    )


class TradeSetupExecuteResponse(BaseSchema):
    run_id: UUID
    symbol_id: UUID
    timeframe: str
    engine_version: str
    params_hash: str
    setups_detected: int
    bars_scanned: int
    computed_at: datetime


class TradeSetupZone(BaseSchema):
    high: float
    low: float
    label: str = ""


class TradeSetupRecord(BaseSchema):
    setup_id: str
    setup_type: str
    direction: str
    confidence_score: float
    confidence_level: str
    evidence_scores: dict[str, float]
    entry_zone: TradeSetupZone
    stop_loss_zone: TradeSetupZone
    target_zones: list[TradeSetupZone]
    risk_reward: float | None
    status: str
    explanation: str
    reference_ids: dict[str, Any]
    detected_at: datetime
    engine_version: str
    params_hash: str
    run_id: UUID | None = None


class TradeSetupListResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    items: list[TradeSetupRecord]
    total: int


class TradeSetupDetailResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    item: TradeSetupRecord
