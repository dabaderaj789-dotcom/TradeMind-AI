"""Trade setup ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TradeSetupRun(Base):
    """Detection run metadata for reproducible backtests."""

    __tablename__ = "trade_setup_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    symbol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("symbols.id"), nullable=False,
    )
    timeframe_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("timeframes.id"), nullable=False,
    )
    engine_version: Mapped[str] = mapped_column(String(32), nullable=False)
    params_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    analysis_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    setups_detected: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    bars_scanned: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )


class TradeSetup(Base):
    """Persisted trade setup with versioning via engine_version + params_hash."""

    __tablename__ = "trade_setups"

    setup_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trade_setup_runs.id"), nullable=False,
    )
    symbol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("symbols.id"), nullable=False,
    )
    timeframe_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("timeframes.id"), nullable=False,
    )
    engine_version: Mapped[str] = mapped_column(String(32), nullable=False)
    params_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    setup_type: Mapped[str] = mapped_column(String(64), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_level: Mapped[str] = mapped_column(String(16), nullable=False)
    evidence_scores: Mapped[dict] = mapped_column(JSONB, nullable=False)
    entry_zone: Mapped[dict] = mapped_column(JSONB, nullable=False)
    stop_loss_zone: Mapped[dict] = mapped_column(JSONB, nullable=False)
    target_zones: Mapped[list] = mapped_column(JSONB, nullable=False)
    risk_reward: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    reference_ids: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
