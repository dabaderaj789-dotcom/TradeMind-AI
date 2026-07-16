"""Candle endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import MarketDataServiceDep
from app.schemas.market_data import (
    CandleListResponse,
    DownloadCandlesRequest,
    DownloadCandlesResponse,
)

router = APIRouter(prefix="/candles")


@router.post("/download", response_model=DownloadCandlesResponse, summary="Download historical candles")
async def download_candles(
    body: DownloadCandlesRequest,
    service: MarketDataServiceDep,
) -> DownloadCandlesResponse:
    """
    Download historical OHLCV candles from the exchange, validate, and store.

    Supports incremental mode (default): downloads from the latest stored candle forward.
    """
    return await service.download_candles(
        timeframe_code=body.timeframe,
        symbol_id=body.symbol_id,
        exchange_code=body.exchange_code,
        symbol_code=body.symbol_code,
        start=body.start,
        end=body.end,
        incremental=body.incremental,
    )


@router.get("/{symbol_id}", response_model=CandleListResponse, summary="Get stored candles")
async def get_candles(
    symbol_id: uuid.UUID,
    service: MarketDataServiceDep,
    timeframe: str = Query(..., description="Timeframe code: 1m, 5m, 1h, 1d, etc."),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> CandleListResponse:
    """Retrieve stored candles for a symbol and timeframe."""
    return await service.get_candles(
        symbol_id,
        timeframe,
        start=start,
        end=end,
        limit=limit,
        latest=False,
    )


@router.get("/{symbol_id}/latest", response_model=CandleListResponse, summary="Get latest candles")
async def get_latest_candles(
    symbol_id: uuid.UUID,
    service: MarketDataServiceDep,
    timeframe: str = Query(..., description="Timeframe code"),
    limit: int = Query(100, ge=1, le=1000),
) -> CandleListResponse:
    """Retrieve the most recent N stored candles."""
    return await service.get_candles(
        symbol_id,
        timeframe,
        limit=limit,
        latest=True,
    )
