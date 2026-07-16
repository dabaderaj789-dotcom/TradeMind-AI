"""Shared Pydantic schemas used across API endpoints."""

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class BaseSchema(BaseModel):
    """Base schema with ORM mode enabled for SQLAlchemy model conversion."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class MessageResponse(BaseSchema):
    """Simple message response."""

    success: bool = True
    message: str


class ServiceStatus(BaseSchema):
    """Status of an individual service dependency."""

    name: str
    status: str
    latency_ms: float | None = None
    detail: str | None = None


class HealthResponse(BaseSchema):
    """Health check response with dependency statuses."""

    status: str = Field(description="Overall health: healthy | degraded | unhealthy")
    version: str
    environment: str
    timestamp: datetime
    services: list[ServiceStatus]


class PaginatedResponse(BaseSchema, Generic[T]):
    """Generic paginated list response for future list endpoints."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
