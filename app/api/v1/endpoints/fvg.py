"""Fair Value Gap REST endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import FairValueGapServiceDep
from app.schemas.fvg import (
    FvgExecuteRequest,
    FvgExecuteResponse,
    FvgListResponse,
    FvgResultsResponse,
)

router = APIRouter(prefix="/fair-value-gaps")


@router.post("/execute", response_model=FvgExecuteResponse, summary="Execute analysis")
async def execute_fair_value_gaps(
    body: FvgExecuteRequest,
    service: FairValueGapServiceDep,
) -> FvgExecuteResponse:
    """Run Fair Value Gap analysis on stored candles and optionally persist results."""
    return await service.execute(body)


@router.get(
    "/results/{symbol_id}",
    response_model=FvgResultsResponse,
    summary="Retrieve analysis bars",
)
async def get_fvg_results(
    symbol_id: uuid.UUID,
    service: FairValueGapServiceDep,
    timeframe: str = Query(...),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> FvgResultsResponse:
    """Retrieve stored per-bar FVG analysis results."""
    return await service.get_results(symbol_id, timeframe, start=start, end=end, limit=limit)


@router.get(
    "/active/{symbol_id}",
    response_model=FvgListResponse,
    summary="Active FVGs",
)
async def get_active_fvgs(
    symbol_id: uuid.UUID,
    service: FairValueGapServiceDep,
    timeframe: str = Query(...),
) -> FvgListResponse:
    """Return open and partially filled fair value gaps."""
    return await service.get_active(symbol_id, timeframe)


@router.get(
    "/historical/{symbol_id}",
    response_model=FvgListResponse,
    summary="Historical FVGs",
)
async def get_historical_fvgs(
    symbol_id: uuid.UUID,
    service: FairValueGapServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(500, ge=1, le=2000),
) -> FvgListResponse:
    """Return all detected fair value gaps across stored analysis history."""
    return await service.get_historical(symbol_id, timeframe, limit=limit)


@router.get(
    "/filled/{symbol_id}",
    response_model=FvgListResponse,
    summary="Filled FVGs",
)
async def get_filled_fvgs(
    symbol_id: uuid.UUID,
    service: FairValueGapServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(200, ge=1, le=1000),
) -> FvgListResponse:
    """Return partially or fully filled fair value gaps."""
    return await service.get_filled(symbol_id, timeframe, limit=limit)


@router.get(
    "/invalidated/{symbol_id}",
    response_model=FvgListResponse,
    summary="Invalidated FVGs",
)
async def get_invalidated_fvgs(
    symbol_id: uuid.UUID,
    service: FairValueGapServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(200, ge=1, le=1000),
) -> FvgListResponse:
    """Return invalidated fair value gaps."""
    return await service.get_invalidated(symbol_id, timeframe, limit=limit)
