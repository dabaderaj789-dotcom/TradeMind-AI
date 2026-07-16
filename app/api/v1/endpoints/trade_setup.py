"""Trade Setup REST endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import TradeSetupServiceDep
from app.schemas.trade_setup import (
    TradeSetupDetailResponse,
    TradeSetupExecuteRequest,
    TradeSetupExecuteResponse,
    TradeSetupListResponse,
)

router = APIRouter(prefix="/trade-setups")


@router.post("/execute", response_model=TradeSetupExecuteResponse, summary="Execute detection")
async def execute_trade_setups(
    body: TradeSetupExecuteRequest,
    service: TradeSetupServiceDep,
) -> TradeSetupExecuteResponse:
    """Detect trade setups from stored analysis evidence and persist results."""
    return await service.execute(body)


@router.get(
    "/active/{symbol_id}",
    response_model=TradeSetupListResponse,
    summary="Active setups",
)
async def list_active_setups(
    symbol_id: uuid.UUID,
    service: TradeSetupServiceDep,
    timeframe: str = Query(...),
    setup_type: str | None = Query(None),
    min_confidence: float | None = Query(None, ge=0, le=100),
    limit: int = Query(100, ge=1, le=500),
) -> TradeSetupListResponse:
    """List active trade setups with optional filters."""
    return await service.list_active(
        symbol_id,
        timeframe,
        setup_type=setup_type,
        min_confidence=min_confidence,
        limit=limit,
    )


@router.get(
    "/historical/{symbol_id}",
    response_model=TradeSetupListResponse,
    summary="Historical setups",
)
async def list_historical_setups(
    symbol_id: uuid.UUID,
    service: TradeSetupServiceDep,
    timeframe: str = Query(...),
    setup_type: str | None = Query(None),
    direction: str | None = Query(None, pattern="^(bullish|bearish)$"),
    min_confidence: float | None = Query(None, ge=0, le=100),
    limit: int = Query(200, ge=1, le=1000),
) -> TradeSetupListResponse:
    """List all persisted trade setups with filters."""
    return await service.list_historical(
        symbol_id,
        timeframe,
        setup_type=setup_type,
        direction=direction,
        min_confidence=min_confidence,
        limit=limit,
    )


@router.get(
    "/details/{symbol_id}",
    response_model=TradeSetupDetailResponse,
    summary="Setup details",
)
async def get_setup_details(
    symbol_id: uuid.UUID,
    service: TradeSetupServiceDep,
    setup_id: str = Query(...),
    timeframe: str = Query(...),
) -> TradeSetupDetailResponse:
    """Retrieve full details for a single trade setup."""
    return await service.get_details(symbol_id, timeframe, setup_id)
