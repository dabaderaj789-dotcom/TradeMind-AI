"""V7 Professional Market Data Engine endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.market_engine import MarketAccuracyReport, OptionChainResponse, TickQuoteResponse
from app.services.market_engine import MarketEngineService

router = APIRouter(prefix="/market-engine", tags=["Market Engine V7"])


def _svc(session: AsyncSession = Depends(get_db)) -> MarketEngineService:
    return MarketEngineService(session)


@router.get(
    "/tick/{symbol_id}",
    response_model=TickQuoteResponse,
    summary="Lightweight last-price tick (tip paint)",
)
async def get_tick(symbol_id: uuid.UUID, service: MarketEngineService = Depends(_svc)) -> TickQuoteResponse:
    return await service.get_tick(symbol_id)


@router.get(
    "/option-chain/{underlying}",
    response_model=OptionChainResponse,
    summary="Option chain via active MARKET_DATA_OPTION_CHAIN_PROVIDER",
)
async def get_option_chain(
    underlying: str,
    expiry: str | None = Query(None),
    service: MarketEngineService = Depends(_svc),
) -> OptionChainResponse:
    return await service.get_option_chain(underlying, expiry=expiry)


@router.get(
    "/providers",
    summary="List registered market-data providers and role bindings",
)
async def list_providers(service: MarketEngineService = Depends(_svc)) -> dict[str, Any]:
    return await service.list_providers()


@router.get(
    "/accuracy-report",
    response_model=MarketAccuracyReport,
    summary="Live price accuracy self-check vs provider",
)
async def accuracy_report(service: MarketEngineService = Depends(_svc)) -> MarketAccuracyReport:
    return await service.accuracy_report()
