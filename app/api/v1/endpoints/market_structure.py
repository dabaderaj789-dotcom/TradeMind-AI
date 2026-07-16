"""Market Structure REST endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import MarketStructureServiceDep
from app.schemas.market_structure import (
    LevelsResponse,
    MarketStructureExecuteRequest,
    MarketStructureExecuteResponse,
    MarketStructureResultsResponse,
    StructureEventsResponse,
    TrendResponse,
)

router = APIRouter(prefix="/market-structure")


@router.post("/execute", response_model=MarketStructureExecuteResponse, summary="Execute analysis")
async def execute_market_structure(
    body: MarketStructureExecuteRequest,
    service: MarketStructureServiceDep,
) -> MarketStructureExecuteResponse:
    """Run Market Structure analysis on stored candles and optionally persist results."""
    return await service.execute(body)


@router.get(
    "/results/{symbol_id}",
    response_model=MarketStructureResultsResponse,
    summary="Retrieve results",
)
async def get_market_structure_results(
    symbol_id: uuid.UUID,
    service: MarketStructureServiceDep,
    timeframe: str = Query(...),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> MarketStructureResultsResponse:
    """Retrieve stored Market Structure analysis bars."""
    return await service.get_results(symbol_id, timeframe, start=start, end=end, limit=limit)


@router.get("/trend/{symbol_id}", response_model=TrendResponse, summary="Current trend")
async def get_current_trend(
    symbol_id: uuid.UUID,
    service: MarketStructureServiceDep,
    timeframe: str = Query(...),
) -> TrendResponse:
    """Return the latest trend and market phase for a symbol."""
    return await service.get_current_trend(symbol_id, timeframe)


@router.get("/levels/{symbol_id}", response_model=LevelsResponse, summary="Support/resistance")
async def get_levels(
    symbol_id: uuid.UUID,
    service: MarketStructureServiceDep,
    timeframe: str = Query(...),
) -> LevelsResponse:
    """Return current dynamic support and resistance levels."""
    return await service.get_levels(symbol_id, timeframe)


@router.get("/events/{symbol_id}", response_model=StructureEventsResponse, summary="BOS/CHoCH history")
async def get_structure_events(
    symbol_id: uuid.UUID,
    service: MarketStructureServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(200, ge=1, le=1000),
) -> StructureEventsResponse:
    """Return BOS and CHoCH event history."""
    return await service.get_events(symbol_id, timeframe, limit=limit)
