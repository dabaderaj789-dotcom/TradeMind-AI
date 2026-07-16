"""Exchange ORM model."""

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Exchange(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "exchanges"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    market_types: Mapped[list[str]] = mapped_column(ARRAY(String(32)), nullable=False)
    api_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ws_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    symbols = relationship("Symbol", back_populates="exchange")
