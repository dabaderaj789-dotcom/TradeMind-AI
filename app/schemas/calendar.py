"""Schemas for economic calendar."""

from app.schemas.common import BaseSchema


class CalendarEventResponse(BaseSchema):
    id: str
    title: str
    market: str
    time_label: str
    impact: str  # high | medium


class CalendarEventListResponse(BaseSchema):
    date: str
    items: list[CalendarEventResponse]
    total: int
