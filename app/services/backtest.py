"""Backtesting application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, fields

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError as AppValidationError
from app.engines.analysis.utils import candle_model_to_bar, hash_parameters
from app.engines.backtesting.engine import BacktestEngine
from app.engines.backtesting.types import BACKTEST_ENGINE_VERSION, BacktestConfig, BacktestInput
from app.engines.strategy.registry import get_strategy_registry
from app.engines.strategy.types import TradePlan
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.candle import CandleRepository
from app.repositories.strategy_backtest import BacktestRepository, TradePlanRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.strategy_backtest import (
    BacktestStartRequest,
    BacktestStartResponse,
    BacktestStatusResponse,
    BacktestTradeResponse,
    BacktestTradesResponse,
    EquityCurveResponse,
    PerformanceReportResponse,
)
from app.services.strategy import StrategyService
from app.schemas.strategy_backtest import StrategyExecuteRequest


@dataclass
class BacktestService:
    session: AsyncSession
    strategy_service: StrategyService

    async def start(self, request: BacktestStartRequest) -> BacktestStartResponse:
        symbol = await SymbolRepository(self.session).get_by_id_or_raise(request.symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(request.timeframe)
        registry = get_strategy_registry()
        strategy = registry.get(request.strategy_id)
        params = strategy.validate(request.parameters)
        params_hash = hash_parameters(params)

        bt_config = _build_backtest_config(request.backtest_config or {})
        config_dict = {f.name: getattr(bt_config, f.name) for f in fields(bt_config)}

        repo = BacktestRepository(self.session)
        run = await repo.create_run(
            strategy_id=strategy.strategy_id(),
            strategy_version=strategy.strategy_version(),
            params_hash=params_hash,
            engine_version=BACKTEST_ENGINE_VERSION,
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
            config=config_dict,
            initial_capital=bt_config.initial_capital,
            symbol_ids=[str(s) for s in request.symbol_ids] if request.symbol_ids else None,
            timeframes=request.timeframes,
        )

        all_trades = []
        final_capital = bt_config.initial_capital
        bars_processed = 0
        report_data: dict = {}

        symbols_to_run = request.symbol_ids or [request.symbol_id]
        timeframes_to_run = request.timeframes or [request.timeframe]

        for sym_id in symbols_to_run:
            for tf_code in timeframes_to_run:
                sym = await SymbolRepository(self.session).get_by_id_or_raise(sym_id)
                tf = await TimeframeRepository(self.session).get_by_code_or_raise(tf_code)
                result = await self._run_single_symbol(
                    symbol_id=sym.id,
                    timeframe_id=tf.id,
                    timeframe_code=tf.code,
                    strategy_id=request.strategy_id,
                    params=params,
                    bt_config=bt_config,
                    start=request.start,
                    end=request.end,
                    candle_limit=request.candle_limit,
                )
                all_trades.extend(result["trades"])
                final_capital = result["final_capital"]
                bars_processed += result["bars_processed"]
                report_data = result["report"]

        await repo.save_trades(run.id, symbol.id, all_trades)
        await repo.complete_run(run.id, final_capital=final_capital, bars_processed=bars_processed)
        await repo.save_report(run.id, report_data)

        logger.info("Backtest {} completed — {} trades", run.id, len(all_trades))

        return BacktestStartResponse(
            run_id=run.id,
            status="completed",
            strategy_id=strategy.strategy_id(),
            engine_version=BACKTEST_ENGINE_VERSION,
            params_hash=params_hash,
        )

    async def _run_single_symbol(
        self,
        *,
        symbol_id: uuid.UUID,
        timeframe_id: int,
        timeframe_code: str,
        strategy_id: str,
        params: dict,
        bt_config: BacktestConfig,
        start,
        end,
        candle_limit: int,
    ) -> dict:
        await self.strategy_service.execute(
            StrategyExecuteRequest(
                symbol_id=symbol_id,
                timeframe=timeframe_code,
                strategy_id=strategy_id,
                parameters=params,
                limit=5000,
            )
        )

        plan_rows = await TradePlanRepository(self.session).list_plans(
            symbol_id=symbol_id,
            timeframe_id=timeframe_id,
            strategy_id=strategy_id,
            limit=5000,
        )
        plans = [_row_to_trade_plan(p) for p in plan_rows]

        candle_repo = CandleRepository(self.session)
        orm_candles = await candle_repo.get_candles_for_analysis(
            symbol_id, timeframe_id, start=start, end=end, limit=candle_limit,
        )
        if not orm_candles:
            raise AppValidationError("No candles for backtest", detail=str(symbol_id))

        candles = [candle_model_to_bar(c) for c in orm_candles]
        atr_map = await _load_atr_map(self.session, symbol_id, timeframe_id)

        engine = BacktestEngine()
        bt_input = BacktestInput(candles=candles, plans=plans, atr_by_time=atr_map)
        result = engine.run(bt_input, bt_config)
        report = engine.build_report(result)
        return {
            "trades": result.trades,
            "final_capital": result.final_capital,
            "bars_processed": result.bars_processed,
            "report": report,
        }

    async def get_status(self, run_id: uuid.UUID) -> BacktestStatusResponse:
        run = await _get_run_or_raise(self.session, run_id)
        return BacktestStatusResponse(
            run_id=run.id,
            status=run.status,
            strategy_id=run.strategy_id,
            bars_processed=run.bars_processed,
            initial_capital=run.initial_capital,
            final_capital=run.final_capital,
            started_at=run.started_at,
            completed_at=run.completed_at,
        )

    async def get_trades(self, run_id: uuid.UUID) -> BacktestTradesResponse:
        await _get_run_or_raise(self.session, run_id)
        trades = await BacktestRepository(self.session).get_trades(run_id)
        items = [
            BacktestTradeResponse(
                trade_id=t.trade_id,
                plan_id=t.plan_id,
                setup_id=t.setup_id,
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
            )
            for t in trades
        ]
        return BacktestTradesResponse(run_id=run_id, items=items, total=len(items))

    async def get_report(self, run_id: uuid.UUID) -> PerformanceReportResponse:
        await _get_run_or_raise(self.session, run_id)
        report = await BacktestRepository(self.session).get_report(run_id)
        if report is None:
            raise NotFoundError("Performance report not found", detail=str(run_id))
        return PerformanceReportResponse(
            run_id=run_id,
            metrics=report.metrics,
            equity_curve=report.equity_curve,
            monthly_returns=report.monthly_returns,
            yearly_returns=report.yearly_returns,
            walk_forward_segments=report.walk_forward_segments,
            generated_at=report.generated_at,
        )

    async def get_equity_curve(self, run_id: uuid.UUID) -> EquityCurveResponse:
        report = await BacktestRepository(self.session).get_report(run_id)
        if report is None:
            raise NotFoundError("Equity curve not found", detail=str(run_id))
        return EquityCurveResponse(run_id=run_id, equity_curve=report.equity_curve)


def _build_backtest_config(raw: dict) -> BacktestConfig:
    allowed = {f.name for f in fields(BacktestConfig)}
    filtered = {k: v for k, v in raw.items() if k in allowed}
    return BacktestConfig(**filtered)


def _row_to_trade_plan(row) -> TradePlan:
    return TradePlan(
        plan_id=row.plan_id,
        strategy_id=row.strategy_id,
        strategy_version=row.strategy_version,
        setup_id=row.setup_id,
        direction=row.direction,
        entry_zone_high=float(row.entry_zone["high"]),
        entry_zone_low=float(row.entry_zone["low"]),
        stop_loss=row.stop_loss,
        target_1=row.target_1,
        target_2=row.target_2,
        target_3=row.target_3,
        risk_reward=row.risk_reward,
        trade_expiration_bars=row.trade_expiration_bars,
        position_risk_pct=row.position_risk_pct,
        strategy_confidence=row.strategy_confidence,
        reasoning=row.reasoning,
        detected_at=row.detected_at,
        params_hash=row.params_hash,
    )


async def _load_atr_map(session, symbol_id, timeframe_id) -> dict:
    repo = AnalysisResultRepository(session)
    phash = await repo.get_latest_params_hash(symbol_id, timeframe_id, "atr")
    if not phash:
        return {}
    rows = await repo.get_results(symbol_id, timeframe_id, plugin_id="atr", params_hash=phash, limit=1_000_000)
    return {r.open_time: float(r.values.get("atr", 0)) for r in rows if r.values.get("atr")}


async def _get_run_or_raise(session, run_id: uuid.UUID):
    run = await BacktestRepository(session).get_run(run_id)
    if run is None:
        raise NotFoundError("Backtest run not found", detail=str(run_id))
    return run
