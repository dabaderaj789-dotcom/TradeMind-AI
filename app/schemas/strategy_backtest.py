"""Pydantic schemas for Strategy and Backtesting API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class StrategyMetadataResponse(BaseSchema):
    strategy_id: str
    strategy_name: str
    strategy_version: str
    description: str
    supported_markets: list[str]
    supported_timeframes: list[str]
    required_setup_types: list[str]
    default_parameters: dict[str, Any]


class StrategyListResponse(BaseSchema):
    items: list[StrategyMetadataResponse]
    total: int


class StrategyExecuteRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str
    strategy_id: str
    parameters: dict[str, Any] | None = None
    setup_status: str = Field(default="active")
    min_setup_confidence: float | None = Field(default=None, ge=0, le=100)
    limit: int = Field(default=200, ge=1, le=2000)


class StrategyExecuteResponse(BaseSchema):
    symbol_id: UUID
    timeframe: str
    strategy_id: str
    strategy_version: str
    params_hash: str
    plans_generated: int
    setups_evaluated: int
    setups_rejected: int


class TradePlanResponse(BaseSchema):
    plan_id: str
    strategy_id: str
    setup_id: str
    direction: str
    entry_zone: dict[str, Any]
    stop_loss: float
    target_1: float
    target_2: float
    target_3: float | None
    risk_reward: float
    trade_expiration_bars: int
    position_risk_pct: float
    strategy_confidence: float
    reasoning: str
    detected_at: datetime


class StrategyDetailResponse(BaseSchema):
    strategy: StrategyMetadataResponse
    recent_plans: list[TradePlanResponse]


class BacktestStartRequest(BaseSchema):
    symbol_id: UUID
    timeframe: str
    strategy_id: str
    parameters: dict[str, Any] | None = None
    backtest_config: dict[str, Any] | None = None
    start: datetime | None = None
    end: datetime | None = None
    candle_limit: int = Field(default=10000, ge=50, le=1_000_000)
    symbol_ids: list[UUID] | None = None
    timeframes: list[str] | None = None


class BacktestStartResponse(BaseSchema):
    run_id: UUID
    status: str
    strategy_id: str
    engine_version: str
    params_hash: str


class BacktestStatusResponse(BaseSchema):
    run_id: UUID
    status: str
    strategy_id: str
    bars_processed: int
    initial_capital: float
    final_capital: float | None
    started_at: datetime
    completed_at: datetime | None


class BacktestTradeResponse(BaseSchema):
    trade_id: str
    plan_id: str
    setup_id: str
    direction: str
    entry_time: datetime
    exit_time: datetime | None
    entry_price: float
    exit_price: float | None
    quantity: float
    pnl: float
    pnl_pct: float
    commission: float
    exit_reason: str | None
    bars_held: int


class BacktestTradesResponse(BaseSchema):
    run_id: UUID
    items: list[BacktestTradeResponse]
    total: int


class PerformanceReportResponse(BaseSchema):
    run_id: UUID
    metrics: dict[str, Any]
    equity_curve: list[dict[str, Any]]
    monthly_returns: dict[str, float]
    yearly_returns: dict[str, float]
    walk_forward_segments: list[dict[str, Any]]
    generated_at: datetime


class EquityCurveResponse(BaseSchema):
    run_id: UUID
    equity_curve: list[dict[str, Any]]
