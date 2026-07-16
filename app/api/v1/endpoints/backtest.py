"""Backtesting REST endpoints."""

import uuid

from fastapi import APIRouter

from app.api.deps import BacktestServiceDep
from app.schemas.strategy_backtest import (
    BacktestStartRequest,
    BacktestStartResponse,
    BacktestStatusResponse,
    BacktestTradesResponse,
    EquityCurveResponse,
    PerformanceReportResponse,
)

router = APIRouter(prefix="/backtests")


@router.post("/start", response_model=BacktestStartResponse, summary="Start backtest")
async def start_backtest(
    body: BacktestStartRequest,
    service: BacktestServiceDep,
) -> BacktestStartResponse:
    return await service.start(body)


@router.get("/{run_id}/status", response_model=BacktestStatusResponse, summary="Backtest status")
async def get_backtest_status(
    run_id: uuid.UUID,
    service: BacktestServiceDep,
) -> BacktestStatusResponse:
    return await service.get_status(run_id)


@router.get("/{run_id}/results", response_model=PerformanceReportResponse, summary="Backtest results")
async def get_backtest_results(
    run_id: uuid.UUID,
    service: BacktestServiceDep,
) -> PerformanceReportResponse:
    return await service.get_report(run_id)


@router.get("/{run_id}/trades", response_model=BacktestTradesResponse, summary="Trade history")
async def get_backtest_trades(
    run_id: uuid.UUID,
    service: BacktestServiceDep,
) -> BacktestTradesResponse:
    return await service.get_trades(run_id)


@router.get("/{run_id}/report", response_model=PerformanceReportResponse, summary="Performance report")
async def get_performance_report(
    run_id: uuid.UUID,
    service: BacktestServiceDep,
) -> PerformanceReportResponse:
    return await service.get_report(run_id)


@router.get("/{run_id}/equity-curve", response_model=EquityCurveResponse, summary="Equity curve")
async def get_equity_curve(
    run_id: uuid.UUID,
    service: BacktestServiceDep,
) -> EquityCurveResponse:
    return await service.get_equity_curve(run_id)
