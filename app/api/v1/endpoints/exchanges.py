"""Exchange endpoints."""

from fastapi import APIRouter, Query

from app.api.deps import MarketDataServiceDep
from app.schemas.market_data import PaginatedExchangeResponse

router = APIRouter(prefix="/exchanges")


@router.get("", response_model=PaginatedExchangeResponse, summary="List exchanges")
async def list_exchanges(
    service: MarketDataServiceDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> PaginatedExchangeResponse:
    """Return all active exchanges registered in the platform."""
    return await service.list_exchanges(page=page, page_size=page_size)
