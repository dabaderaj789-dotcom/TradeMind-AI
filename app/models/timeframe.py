"""Timeframe ORM model."""

from sqlalchemy import Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Timeframe(Base):
    __tablename__ = "timeframes"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False)
