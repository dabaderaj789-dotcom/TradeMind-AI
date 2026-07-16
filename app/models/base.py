"""Shared ORM mixins."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AuditLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """System audit trail."""

    __tablename__ = "audit_logs"

    event_type: Mapped[str] = mapped_column(nullable=False, index=True)
    message: Mapped[str] = mapped_column(nullable=False)
    metadata_json: Mapped[str | None] = mapped_column(nullable=True)
