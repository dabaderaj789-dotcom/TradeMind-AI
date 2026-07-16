"""Market ORM model."""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Market(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "markets"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    market_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False)

    symbols = relationship("Symbol", back_populates="market")
