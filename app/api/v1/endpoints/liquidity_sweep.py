"""Liquidity Sweep REST endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import LiquiditySweepServiceDep
from app.schemas.liquidity_sweep import (
    LiquiditySweepDetailResponse,
    LiquiditySweepExecuteRequest,
    LiquiditySweepExecuteResponse,
    LiquiditySweepListResponse,
    LiquiditySweepResultsResponse,
)

router = APIRouter(prefix="/liquidity-sweeps")


@router.post("/execute", response_model=LiquiditySweepExecuteResponse, summary="Execute analysis")
async def execute_liquidity_sweeps(
    body: LiquiditySweepExecuteRequest,
    service: LiquiditySweepServiceDep,
) -> LiquiditySweepExecuteResponse:
    """Run Liquidity Sweep analysis on stored candles and optionally persist results."""
    return await service.execute(body)


@router.get(
    "/results/{symbol_id}",
    response_model=LiquiditySweepResultsResponse,
    summary="Retrieve analysis bars",
)
async def get_liquidity_sweep_results(
    symbol_id: uuid.UUID,
    service: LiquiditySweepServiceDep,
    timeframe: str = Query(...),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> LiquiditySweepResultsResponse:
    """Retrieve stored per-bar liquidity sweep analysis results."""
    return await service.get_results(symbol_id, timeframe, start=start, end=end, limit=limit)


@router.get(
    "/active/{symbol_id}",
    response_model=LiquiditySweepListResponse,
    summary="Active sweeps",
)
async def get_active_sweeps(
    symbol_id: uuid.UUID,
    service: LiquiditySweepServiceDep,
    timeframe: str = Query(...),
) -> LiquiditySweepListResponse:
    """Return active and confirmed liquidity sweeps."""
    return await service.get_active(symbol_id, timeframe)


@router.get(
    "/historical/{symbol_id}",
    response_model=LiquiditySweepListResponse,
    summary="Historical sweeps",
)
async def get_historical_sweeps(
    symbol_id: uuid.UUID,
    service: LiquiditySweepServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(500, ge=1, le=2000),
) -> LiquiditySweepListResponse:
    """Return all detected liquidity sweeps across stored analysis history."""
    return await service.get_historical(symbol_id, timeframe, limit=limit)


@router.get(
    "/failed/{symbol_id}",
    response_model=LiquiditySweepListResponse,
    summary="Failed sweeps",
)
async def get_failed_sweeps(
    symbol_id: uuid.UUID,
    service: LiquiditySweepServiceDep,
    timeframe: str = Query(...),
    limit: int = Query(200, ge=1, le=1000),
) -> LiquiditySweepListResponse:
    """Return failed liquidity sweeps (no rejection confirmation)."""
    return await service.get_failed(symbol_id, timeframe, limit=limit)


@router.get(
    "/details/{symbol_id}",
    response_model=LiquiditySweepDetailResponse,
    summary="Sweep details",
)
async def get_sweep_details(
    symbol_id: uuid.UUID,
    service: LiquiditySweepServiceDep,
    sweep_id: str = Query(..., description="Liquidity sweep ID"),
    timeframe: str = Query(...),
) -> LiquiditySweepDetailResponse:
    """Return full details for a single liquidity sweep by ID."""
    return await service.get_details(symbol_id, timeframe, sweep_id)
