"""Symbol ORM model."""

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Symbol(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "symbols"
    __table_args__ = (UniqueConstraint("exchange_id", "symbol_code", name="uq_symbols_exchange_code"),)

    exchange_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exchanges.id"), nullable=False
    )
    market_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("markets.id"), nullable=False
    )
    symbol_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_asset: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quote_asset: Mapped[str | None] = mapped_column(String(32), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(16), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(128), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tick_size: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False, default=Decimal("0.01"))
    lot_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)

    exchange = relationship("Exchange", back_populates="symbols")
    market = relationship("Market", back_populates="symbols")
    candles = relationship("Candle", back_populates="symbol")
