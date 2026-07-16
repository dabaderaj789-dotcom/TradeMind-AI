"""Live session quotes for the Trading Terminal."""

import uuid

from fastapi import APIRouter, Query

from app.api.deps import QuoteServiceDep
from app.schemas.quotes import MarketQuoteResponse, OhlcCompareResponse, QuoteVerifyResponse

router = APIRouter()


@router.get(
    "/quotes/{symbol_id}",
    response_model=MarketQuoteResponse,
    summary="Live session quote",
)
async def get_quote(symbol_id: uuid.UUID, service: QuoteServiceDep) -> MarketQuoteResponse:
    """Current price, day OHLC, prev close — derived from persisted candles."""
    return await service.get_quote(symbol_id)


@router.get(
    "/debug/quote-verify/{symbol_id}",
    response_model=QuoteVerifyResponse,
    summary="Verify quote vs stored bars",
)
async def quote_verify(symbol_id: uuid.UUID, service: QuoteServiceDep) -> QuoteVerifyResponse:
    return await service.verify_quote(symbol_id)


@router.get(
    "/debug/ohlc-compare/{symbol_id}",
    response_model=OhlcCompareResponse,
    summary="OHLC compare diagnostic",
)
async def ohlc_compare(
    symbol_id: uuid.UUID,
    service: QuoteServiceDep,
    timeframe: str = Query("1h"),
    limit: int = Query(40, ge=5, le=200),
) -> OhlcCompareResponse:
    return await service.compare_ohlc(symbol_id, timeframe, limit)
