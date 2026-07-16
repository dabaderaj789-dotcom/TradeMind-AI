"""Deterministic replay-safe backtesting engine."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from app.engines.backtesting.reports import build_structured_report
from app.engines.backtesting.execution import commission_cost, try_fill_entry
from app.engines.backtesting.position_sizing import calculate_position_size
from app.engines.backtesting.trade_manager import manage_position
from app.engines.backtesting.types import (
    BACKTEST_ENGINE_VERSION,
    BacktestConfig,
    BacktestInput,
    BacktestMode,
    BacktestResult,
    OpenPosition,
    PendingOrder,
    SimulatedTrade,
    TradeExitReason,
)
from app.engines.strategy.types import TradePlan


class BacktestEngine:
    """Replay-safe backtesting over candles and trade plans."""

    @property
    def engine_version(self) -> str:
        return BACKTEST_ENGINE_VERSION

    def run(self, data: BacktestInput, config: BacktestConfig) -> BacktestResult:
        if config.mode == BacktestMode.WALK_FORWARD.value:
            return self._run_walk_forward(data, config)
        return self._run_single(data, config)

    def _run_walk_forward(self, data: BacktestInput, config: BacktestConfig) -> BacktestResult:
        candles = data.candles
        n = len(candles)
        train = config.walk_forward_train_bars
        test = config.walk_forward_test_bars
        step = config.walk_forward_step_bars
        all_trades: list[SimulatedTrade] = []
        segments: list[dict] = []
        equity: list[dict] = []
        capital = config.initial_capital

        start = train
        while start + test <= n:
            segment_candles = candles[start : start + test]
            segment_plans = [
                p for p in data.plans
                if any(c.open_time == p.detected_at for c in segment_candles)
            ]
            seg_config = BacktestConfig(**{**config.__dict__, "mode": BacktestMode.HISTORICAL.value, "initial_capital": capital})
            seg_input = BacktestInput(
                candles=segment_candles,
                plans=segment_plans,
                atr_by_time=data.atr_by_time,
            )
            seg_result = self._run_single(seg_input, seg_config)
            all_trades.extend(seg_result.trades)
            capital = seg_result.final_capital
            equity.extend(seg_result.equity_curve)
            segments.append({
                "start_index": start,
                "end_index": start + test,
                "trades": len(seg_result.trades),
                "final_capital": capital,
            })
            start += step

        return BacktestResult(
            trades=all_trades,
            equity_curve=equity,
            final_capital=capital,
            config=config,
            bars_processed=n,
            walk_forward_segments=segments,
        )

    def _run_single(self, data: BacktestInput, config: BacktestConfig) -> BacktestResult:
        candles = data.candles
        plans_by_time: dict[datetime, list[TradePlan]] = {}
        for plan in sorted(data.plans, key=lambda p: p.detected_at):
            plans_by_time.setdefault(plan.detected_at, []).append(plan)

        capital = config.initial_capital
        equity_curve: list[dict] = []
        closed_trades: list[SimulatedTrade] = []
        open_positions: list[OpenPosition] = []
        pending_orders: list[PendingOrder] = []

        for bar_index, bar in enumerate(candles):
            atr = data.atr_by_time.get(bar.open_time)

            for pos in list(open_positions):
                exit_qty, reason, exit_price = manage_position(
                    pos, bar, bar_index, config, atr,
                )
                if exit_qty > 0 and reason:
                    pnl = _calc_pnl(pos.trade.direction, pos.trade.entry_price, exit_price, exit_qty)
                    comm = commission_cost(exit_price * exit_qty, config)
                    pnl -= comm
                    capital += pnl
                    pos.trade.partial_exits.append({
                        "qty": exit_qty,
                        "price": exit_price,
                        "reason": reason,
                        "pnl": pnl,
                    })
                    if pos.remaining_qty <= exit_qty + 1e-12:
                        pos.trade.exit_time = bar.open_time
                        pos.trade.exit_price = exit_price
                        pos.trade.pnl = sum(e["pnl"] for e in pos.trade.partial_exits)
                        pos.trade.commission += comm
                        pos.trade.exit_reason = reason
                        pos.trade.bars_held = bar_index - pos.entry_bar_index
                        pos.trade.pnl_pct = (
                            pos.trade.pnl / (pos.trade.entry_price * pos.trade.quantity) * 100
                            if pos.trade.quantity > 0
                            else 0.0
                        )
                        closed_trades.append(pos.trade)
                        open_positions.remove(pos)
                    else:
                        pos.remaining_qty -= exit_qty

            pending_orders = [
                o for o in pending_orders
                if bar_index <= o.expires_bar_index
            ]

            for plan in plans_by_time.get(bar.open_time, []):
                pending_orders.append(
                    PendingOrder(
                        plan=plan,
                        order_type=config.order_type,
                        created_bar_index=bar_index,
                        expires_bar_index=bar_index + plan.trade_expiration_bars,
                    )
                )

            for order in list(pending_orders):
                if any(p.plan.plan_id == order.plan.plan_id for p in open_positions):
                    pending_orders.remove(order)
                    continue
                fill = try_fill_entry(bar, order.plan, config)
                if fill is None:
                    continue
                qty = calculate_position_size(
                    config=config,
                    capital=capital,
                    entry_price=fill,
                    stop_loss=order.plan.stop_loss,
                    atr=atr,
                )
                if qty <= 0:
                    pending_orders.remove(order)
                    continue
                comm = commission_cost(fill * qty, config)
                capital -= comm
                trade = SimulatedTrade(
                    trade_id=uuid4().hex[:16],
                    plan_id=order.plan.plan_id,
                    setup_id=order.plan.setup_id,
                    direction=order.plan.direction,
                    entry_time=bar.open_time,
                    exit_time=None,
                    entry_price=fill,
                    exit_price=None,
                    quantity=qty,
                    commission=comm,
                )
                open_positions.append(
                    OpenPosition(
                        trade=trade,
                        plan=order.plan,
                        stop_loss=order.plan.stop_loss,
                        target_1=order.plan.target_1,
                        target_2=order.plan.target_2,
                        target_3=order.plan.target_3,
                        remaining_qty=qty,
                        entry_bar_index=bar_index,
                    )
                )
                pending_orders.remove(order)

            equity_curve.append({
                "time": bar.open_time.isoformat(),
                "equity": round(capital, 4),
                "bar_index": bar_index,
            })

        for pos in open_positions:
            last = candles[-1]
            exit_price = last.close
            pnl = _calc_pnl(pos.trade.direction, pos.trade.entry_price, exit_price, pos.remaining_qty)
            comm = commission_cost(exit_price * pos.remaining_qty, config)
            pnl -= comm
            capital += pnl
            pos.trade.exit_time = last.open_time
            pos.trade.exit_price = exit_price
            pos.trade.pnl = pnl
            pos.trade.commission += comm
            pos.trade.exit_reason = TradeExitReason.END_OF_DATA.value
            pos.trade.bars_held = len(candles) - 1 - pos.entry_bar_index
            closed_trades.append(pos.trade)

        return BacktestResult(
            trades=closed_trades,
            equity_curve=equity_curve,
            final_capital=capital,
            config=config,
            bars_processed=len(candles),
        )

    def build_report(
        self,
        result: BacktestResult,
    ) -> dict:
        return build_structured_report(result)


def _calc_pnl(direction: str, entry: float, exit_: float, qty: float) -> float:
    if direction == "bullish":
        return (exit_ - entry) * qty
    return (entry - exit_) * qty
