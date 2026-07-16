"""Strategy and backtesting ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StrategyDefinition(Base):
    __tablename__ = "strategy_definitions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    strategy_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    strategy_name: Mapped[str] = mapped_column(String(128), nullable=False)
    current_version: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    supported_markets: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    supported_timeframes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    required_setup_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    parameters_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )


class StrategyVersion(Base):
    __tablename__ = "strategy_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    strategy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    parameters_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class TradePlanRecord(Base):
    __tablename__ = "trade_plans"

    plan_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    strategy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    strategy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    params_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    setup_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    symbol_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("symbols.id"), nullable=False)
    timeframe_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("timeframes.id"), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    entry_zone: Mapped[dict] = mapped_column(JSONB, nullable=False)
    stop_loss: Mapped[float] = mapped_column(Float, nullable=False)
    target_1: Mapped[float] = mapped_column(Float, nullable=False)
    target_2: Mapped[float] = mapped_column(Float, nullable=False)
    target_3: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_reward: Mapped[float] = mapped_column(Float, nullable=False)
    trade_expiration_bars: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    position_risk_pct: Mapped[float] = mapped_column(Float, nullable=False)
    strategy_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="approved")
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    strategy_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    strategy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    params_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("symbols.id"), nullable=False)
    timeframe_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("timeframes.id"), nullable=False)
    symbol_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    timeframes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="completed")
    initial_capital: Mapped[float] = mapped_column(Float, nullable=False)
    final_capital: Mapped[float | None] = mapped_column(Float, nullable=True)
    bars_processed: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    trade_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backtest_runs.id"), nullable=False, index=True,
    )
    plan_id: Mapped[str] = mapped_column(String(32), nullable=False)
    setup_id: Mapped[str] = mapped_column(String(32), nullable=False)
    symbol_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("symbols.id"), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    entry_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    commission: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    exit_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    bars_held: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    partial_exits: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class PerformanceReport(Base):
    __tablename__ = "performance_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backtest_runs.id"), unique=True, nullable=False,
    )
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)
    equity_curve: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    monthly_returns: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    yearly_returns: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    walk_forward_segments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
