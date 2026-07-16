"""Candle ORM model."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Candle(Base):
    __tablename__ = "candles"

    symbol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("symbols.id"), primary_key=True
    )
    timeframe_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("timeframes.id"), primary_key=True
    )
    open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    open: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    volume: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False, default=Decimal("0"))
    quote_volume: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    trades_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="historical")

    symbol = relationship("Symbol", back_populates="candles")
    timeframe = relationship("Timeframe")
