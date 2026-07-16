"""Backtesting engine types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from app.engines.analysis.types import CandleBar
from app.engines.strategy.types import TradePlan


BACKTEST_ENGINE_VERSION = "1.0.0"


class OrderType(StrEnum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"


class PositionSizingMode(StrEnum):
    FIXED = "fixed"
    PERCENT_RISK = "percent_risk"
    ATR = "atr"
    FIXED_FRACTIONAL = "fixed_fractional"


class BacktestMode(StrEnum):
    HISTORICAL = "historical"
    INCREMENTAL = "incremental"
    WALK_FORWARD = "walk_forward"


class TradeExitReason(StrEnum):
    STOP_LOSS = "stop_loss"
    TARGET_1 = "target_1"
    TARGET_2 = "target_2"
    TARGET_3 = "target_3"
    TRAILING_STOP = "trailing_stop"
    BREAKEVEN = "breakeven"
    TIME_EXIT = "time_exit"
    EXPIRED = "expired"
    END_OF_DATA = "end_of_data"


@dataclass
class BacktestConfig:
    initial_capital: float = 10_000.0
    commission_pct: float = 0.001
    slippage_pct: float = 0.0005
    spread: float = 0.0
    tick_size: float = 0.01
    trading_fee_flat: float = 0.0
    order_type: str = "limit"
    position_sizing: str = "percent_risk"
    position_risk_pct: float = 1.0
    fixed_size: float = 1.0
    fixed_fractional_pct: float = 10.0
    atr_risk_mult: float = 1.5
    partial_take_pct: float = 0.5
    move_to_breakeven: bool = True
    trailing_stop_atr_mult: float | None = None
    max_bars_in_trade: int | None = None
    mode: str = "historical"
    walk_forward_train_bars: int = 500
    walk_forward_test_bars: int = 100
    walk_forward_step_bars: int = 100


@dataclass
class SimulatedTrade:
    trade_id: str
    plan_id: str
    setup_id: str
    direction: str
    entry_time: datetime
    exit_time: datetime | None
    entry_price: float
    exit_price: float | None
    quantity: float
    pnl: float = 0.0
    pnl_pct: float = 0.0
    commission: float = 0.0
    exit_reason: str | None = None
    bars_held: int = 0
    partial_exits: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class OpenPosition:
    trade: SimulatedTrade
    plan: TradePlan
    stop_loss: float
    target_1: float
    target_2: float
    target_3: float | None
    remaining_qty: float
    entry_bar_index: int
    breakeven_active: bool = False
    trailing_stop: float | None = None
    target_1_hit: bool = False


@dataclass
class PendingOrder:
    plan: TradePlan
    order_type: str
    created_bar_index: int
    expires_bar_index: int


@dataclass
class BacktestResult:
    trades: list[SimulatedTrade]
    equity_curve: list[dict[str, Any]]
    final_capital: float
    config: BacktestConfig
    bars_processed: int
    walk_forward_segments: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class BacktestInput:
    candles: list[CandleBar]
    plans: list[TradePlan]
    atr_by_time: dict[datetime, float] = field(default_factory=dict)
