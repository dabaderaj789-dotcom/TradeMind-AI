"""Symbol endpoints."""

from fastapi import APIRouter, Query

from app.api.deps import MarketDataServiceDep
from app.schemas.market_data import PaginatedSymbolResponse, SyncSymbolsRequest, SyncSymbolsResponse

router = APIRouter(prefix="/symbols")


@router.get("", response_model=PaginatedSymbolResponse, summary="List symbols")
async def list_symbols(
    service: MarketDataServiceDep,
    exchange_code: str | None = Query(None, description="Filter by exchange code"),
    search: str | None = Query(None, description="Search symbol code or name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    active_only: bool = Query(True),
) -> PaginatedSymbolResponse:
    """Return paginated symbols, optionally filtered by exchange or search query."""
    return await service.list_symbols(
        exchange_code=exchange_code,
        search=search,
        page=page,
        page_size=page_size,
        active_only=active_only,
    )


@router.post("/sync", response_model=SyncSymbolsResponse, summary="Sync symbols from exchange")
async def sync_symbols(
    body: SyncSymbolsRequest,
    service: MarketDataServiceDep,
) -> SyncSymbolsResponse:
    """Fetch symbols from the exchange adapter and upsert into the database."""
    return await service.sync_symbols(body.exchange_code)
