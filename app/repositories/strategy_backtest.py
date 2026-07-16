"""Strategy and backtest persistence."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.strategy.types import TradePlan
from app.models.strategy_backtest import (
    BacktestRun,
    BacktestTrade,
    PerformanceReport,
    StrategyDefinition,
    StrategyVersion,
    TradePlanRecord,
)
from app.repositories.base import BaseRepository


class StrategyRepository(BaseRepository[StrategyDefinition]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, StrategyDefinition)

    async def sync_definition(self, metadata: dict) -> StrategyDefinition:
        stmt = select(StrategyDefinition).where(
            StrategyDefinition.strategy_id == metadata["strategy_id"],
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            row = StrategyDefinition(
                strategy_id=metadata["strategy_id"],
                strategy_name=metadata["strategy_name"],
                current_version=metadata["strategy_version"],
                description=metadata.get("description"),
                supported_markets=metadata.get("supported_markets", []),
                supported_timeframes=metadata.get("supported_timeframes", []),
                required_setup_types=metadata.get("required_setup_types", []),
                parameters_schema=metadata.get("default_parameters", {}),
            )
            self._session.add(row)
        else:
            row.strategy_name = metadata["strategy_name"]
            row.current_version = metadata["strategy_version"]
            row.description = metadata.get("description")
            row.supported_markets = metadata.get("supported_markets", [])
            row.supported_timeframes = metadata.get("supported_timeframes", [])
            row.required_setup_types = metadata.get("required_setup_types", [])
            row.parameters_schema = metadata.get("default_parameters", {})
        await self._session.flush()
        return row

    async def ensure_version(self, strategy_id: str, version: str, schema: dict) -> None:
        stmt = select(StrategyVersion).where(
            StrategyVersion.strategy_id == strategy_id,
            StrategyVersion.version == version,
        )
        result = await self._session.execute(stmt)
        if result.scalar_one_or_none() is None:
            self._session.add(
                StrategyVersion(
                    strategy_id=strategy_id,
                    version=version,
                    parameters_schema=schema,
                )
            )
            await self._session.flush()

    async def list_definitions(self) -> list[StrategyDefinition]:
        result = await self._session.execute(select(StrategyDefinition).order_by(StrategyDefinition.strategy_id))
        return list(result.scalars().all())

    async def get_definition(self, strategy_id: str) -> StrategyDefinition | None:
        stmt = select(StrategyDefinition).where(StrategyDefinition.strategy_id == strategy_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()


class TradePlanRepository(BaseRepository[TradePlanRecord]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, TradePlanRecord)

    async def save_plans(
        self,
        *,
        plans: list[TradePlan],
        symbol_id: uuid.UUID,
        timeframe_id: int,
    ) -> int:
        for plan in plans:
            self._session.add(
                TradePlanRecord(
                    plan_id=plan.plan_id,
                    strategy_id=plan.strategy_id,
                    strategy_version=plan.strategy_version,
                    params_hash=plan.params_hash,
                    setup_id=plan.setup_id,
                    symbol_id=symbol_id,
                    timeframe_id=timeframe_id,
                    direction=plan.direction,
                    entry_zone={
                        "high": plan.entry_zone_high,
                        "low": plan.entry_zone_low,
                    },
                    stop_loss=plan.stop_loss,
                    target_1=plan.target_1,
                    target_2=plan.target_2,
                    target_3=plan.target_3,
                    risk_reward=plan.risk_reward,
                    trade_expiration_bars=plan.trade_expiration_bars,
                    position_risk_pct=plan.position_risk_pct,
                    strategy_confidence=plan.strategy_confidence,
                    reasoning=plan.reasoning,
                    status="approved",
                    detected_at=plan.detected_at,
                )
            )
        await self._session.flush()
        return len(plans)

    async def list_plans(
        self,
        *,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        strategy_id: str | None = None,
        limit: int = 200,
    ) -> list[TradePlanRecord]:
        stmt = select(TradePlanRecord).where(
            TradePlanRecord.symbol_id == symbol_id,
            TradePlanRecord.timeframe_id == timeframe_id,
        )
        if strategy_id:
            stmt = stmt.where(TradePlanRecord.strategy_id == strategy_id)
        stmt = stmt.order_by(desc(TradePlanRecord.detected_at)).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_plan(self, plan_id: str) -> TradePlanRecord | None:
        stmt = select(TradePlanRecord).where(TradePlanRecord.plan_id == plan_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()


class BacktestRepository(BaseRepository[BacktestRun]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, BacktestRun)

    async def create_run(
        self,
        *,
        strategy_id: str,
        strategy_version: str,
        params_hash: str,
        engine_version: str,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        config: dict,
        initial_capital: float,
        symbol_ids: list[str] | None = None,
        timeframes: list[str] | None = None,
    ) -> BacktestRun:
        run = BacktestRun(
            strategy_id=strategy_id,
            strategy_version=strategy_version,
            params_hash=params_hash,
            engine_version=engine_version,
            symbol_id=symbol_id,
            timeframe_id=timeframe_id,
            symbol_ids=symbol_ids,
            timeframes=timeframes,
            config=config,
            status="running",
            initial_capital=initial_capital,
        )
        self._session.add(run)
        await self._session.flush()
        return run

    async def complete_run(
        self,
        run_id: uuid.UUID,
        *,
        final_capital: float,
        bars_processed: int,
    ) -> None:
        stmt = select(BacktestRun).where(BacktestRun.id == run_id)
        result = await self._session.execute(stmt)
        run = result.scalar_one()
        run.status = "completed"
        run.final_capital = final_capital
        run.bars_processed = bars_processed
        run.completed_at = datetime.now(UTC)
        await self._session.flush()

    async def get_run(self, run_id: uuid.UUID) -> BacktestRun | None:
        stmt = select(BacktestRun).where(BacktestRun.id == run_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def save_trades(self, run_id: uuid.UUID, symbol_id: uuid.UUID, trades: list) -> int:
        for t in trades:
            self._session.add(
                BacktestTrade(
                    trade_id=t.trade_id,
                    run_id=run_id,
                    plan_id=t.plan_id,
                    setup_id=t.setup_id,
                    symbol_id=symbol_id,
                    direction=t.direction,
                    entry_time=t.entry_time,
                    exit_time=t.exit_time,
                    entry_price=t.entry_price,
                    exit_price=t.exit_price,
                    quantity=t.quantity,
                    pnl=t.pnl,
                    pnl_pct=t.pnl_pct,
                    commission=t.commission,
                    exit_reason=t.exit_reason,
                    bars_held=t.bars_held,
                    partial_exits=t.partial_exits,
                )
            )
        await self._session.flush()
        return len(trades)

    async def save_report(self, run_id: uuid.UUID, report: dict) -> PerformanceReport:
        metrics = report["performance_summary"]
        pr = PerformanceReport(
            run_id=run_id,
            metrics=metrics,
            equity_curve=report.get("equity_curve", []),
            monthly_returns=metrics.get("monthly_returns", {}),
            yearly_returns=metrics.get("yearly_returns", {}),
            walk_forward_segments=report.get("walk_forward_segments", []),
        )
        self._session.add(pr)
        await self._session.flush()
        return pr

    async def get_trades(self, run_id: uuid.UUID) -> list[BacktestTrade]:
        stmt = (
            select(BacktestTrade)
            .where(BacktestTrade.run_id == run_id)
            .order_by(BacktestTrade.entry_time)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_report(self, run_id: uuid.UUID) -> PerformanceReport | None:
        stmt = select(PerformanceReport).where(PerformanceReport.run_id == run_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()
