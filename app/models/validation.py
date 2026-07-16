"""Setup validation review ORM model."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SetupValidationReview(Base):
    """Human review of a detected trade setup for quality analysis."""

    __tablename__ = "setup_validation_reviews"
    __table_args__ = (
        UniqueConstraint("setup_id", name="uq_setup_validation_reviews_setup_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    setup_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("trade_setups.setup_id"), nullable=False, index=True,
    )
    replay_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True,
    )
    symbol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("symbols.id"), nullable=False, index=True,
    )
    timeframe_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("timeframes.id"), nullable=False, index=True,
    )
    setup_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    strategy_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    verdict: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    plugin_issues: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    reviewer: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now(),
    )
