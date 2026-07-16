"""Strategy REST endpoints."""

from uuid import UUID

from fastapi import APIRouter, Query

from app.api.deps import StrategyServiceDep
from app.schemas.strategy_backtest import (
    StrategyDetailResponse,
    StrategyExecuteRequest,
    StrategyExecuteResponse,
    StrategyListResponse,
)

router = APIRouter(prefix="/strategies")


@router.get("", response_model=StrategyListResponse, summary="List strategies")
async def list_strategies(service: StrategyServiceDep) -> StrategyListResponse:
    return await service.list_strategies()


@router.post("/execute", response_model=StrategyExecuteResponse, summary="Execute strategy")
async def execute_strategy(
    body: StrategyExecuteRequest,
    service: StrategyServiceDep,
) -> StrategyExecuteResponse:
    """Evaluate trade setups and generate trade plans."""
    return await service.execute(body)


@router.get("/{strategy_id}", response_model=StrategyDetailResponse, summary="Strategy details")
async def get_strategy_details(
    strategy_id: str,
    service: StrategyServiceDep,
    symbol_id: UUID = Query(...),
    timeframe: str = Query(...),
) -> StrategyDetailResponse:
    return await service.get_details(strategy_id, symbol_id, timeframe)
