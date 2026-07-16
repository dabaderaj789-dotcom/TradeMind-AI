"""Order Block REST endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import OrderBlockServiceDep
from app.schemas.order_block import (
    OrderBlockExecuteRequest,
    OrderBlockExecuteResponse,
    OrderBlockListResponse,
    OrderBlockResultsResponse,
)

router = APIRouter(prefix="/order-blocks")


@router.post("/execute", response_model=OrderBlockExecuteResponse, summary="Execute analysis")
async def execute_order_blocks(
    body: OrderBlockExecuteRequest,
    service: OrderBlockServiceDep,
) -> OrderBlockExecuteResponse:
    """Run Order Block analysis on stored candles and optionally persist results."""
    return await service.execute(body)


@router.get(
    "/results/{symbol_id}",
    response_model=OrderBlockResultsResponse,
    summary="Retrieve analysis bars",
)
async def get_order_block_results(
    symbol_id: uuid.UUID,
    service: OrderBlockServiceDep,
    timeframe: str = Query(...),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> OrderBlockResultsResponse:
    """Retrieve stored per-bar Order Block analysis results."""
    return await service.get_results(symbol_id, timeframe, start=start, end=end, limit=limit)


@router.get(
    "/active/{symbol_id}",
    response_model=OrderBlockListResponse,
    summary="Active order blocks",
)
async def get_active_order_blocks(
    symbol_id: uuid.UUID,
    service: OrderBlockServiceDep,
    timeframe: str = Query(...),
) -> OrderBlockListResponse:
    """Return currently active (non-invalidated) order blocks."""
    return await service.get_active(symbol_id, timeframe)


@router.get(
    "/historical/{symbol_id}",
    response_model=OrderBlockListResponse,
    summary="Historical order blocks",
)
async def get_historical_order_blocks(
    symbol_id: uuid.UUID,
    service: OrderBlockServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(500, ge=1, le=2000),
) -> OrderBlockListResponse:
    """Return all detected order blocks across stored analysis history."""
    return await service.get_historical(symbol_id, timeframe, limit=limit)


@router.get(
    "/mitigated/{symbol_id}",
    response_model=OrderBlockListResponse,
    summary="Mitigated order blocks",
)
async def get_mitigated_order_blocks(
    symbol_id: uuid.UUID,
    service: OrderBlockServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(200, ge=1, le=1000),
) -> OrderBlockListResponse:
    """Return order blocks that have been touched or mitigated."""
    return await service.get_mitigated(symbol_id, timeframe, limit=limit)


@router.get(
    "/invalidated/{symbol_id}",
    response_model=OrderBlockListResponse,
    summary="Invalidated order blocks",
)
async def get_invalidated_order_blocks(
    symbol_id: uuid.UUID,
    service: OrderBlockServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(200, ge=1, le=1000),
) -> OrderBlockListResponse:
    """Return order blocks invalidated by price breaking through the zone."""
    return await service.get_invalidated(symbol_id, timeframe, limit=limit)
