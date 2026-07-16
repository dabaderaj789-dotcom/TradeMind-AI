"""Analysis plugin registry ORM model."""

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AnalysisPlugin(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Registered analysis plugin metadata synced from code registry."""

    __tablename__ = "analysis_plugins"

    plugin_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    plugin_name: Mapped[str] = mapped_column(String(128), nullable=False)
    plugin_version: Mapped[str] = mapped_column(String(32), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    required_history: Mapped[int] = mapped_column(Integer, nullable=False)
    parameters_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    output_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dependencies: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
