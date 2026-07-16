"""Analysis result ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AnalysisResult(Base):
    """
    Persisted analysis output per candle.

    Primary key includes plugin_version so historical values from older
    plugin versions are never overwritten.
    """

    __tablename__ = "analysis_results"

    symbol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("symbols.id"), primary_key=True
    )
    timeframe_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("timeframes.id"), primary_key=True
    )
    open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    plugin_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plugin_version: Mapped[str] = mapped_column(String(32), primary_key=True)
    params_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    values: Mapped[dict] = mapped_column(JSONB, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
