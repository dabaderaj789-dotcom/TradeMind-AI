"""Economic calendar API — no fabricated events.

Returns an empty list until a real calendar provider is wired.
Morning Brief consumes this endpoint instead of client-side demo news.
"""

from datetime import date

from fastapi import APIRouter, Query

from app.schemas.calendar import CalendarEventListResponse

router = APIRouter(prefix="/calendar")


@router.get(
    "/events",
    response_model=CalendarEventListResponse,
    summary="Economic calendar events",
)
async def list_calendar_events(
    day: date | None = Query(None, description="UTC date (defaults to today)"),
) -> CalendarEventListResponse:
    """High-impact calendar for Morning Brief.

    Intentionally empty: TradeMind does not invent news events.
    Hook a real calendar provider here later.
    """
    target = day or date.today()
    return CalendarEventListResponse(date=target.isoformat(), items=[], total=0)
