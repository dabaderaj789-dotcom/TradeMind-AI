"""Performance analytics for backtests."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime
from typing import Any

from app.engines.backtesting.types import SimulatedTrade


def compute_performance(
    trades: list[SimulatedTrade],
    equity_curve: list[dict[str, Any]],
    initial_capital: float,
) -> dict[str, Any]:
    if not trades:
        return _empty_metrics(initial_capital)

    pnls = [t.pnl for t in trades]
    winners = [p for p in pnls if p > 0]
    losers = [p for p in pnls if p <= 0]

    gross_profit = sum(winners)
    gross_loss = abs(sum(losers))
    net_profit = sum(pnls)
    win_rate = len(winners) / len(trades) * 100.0 if trades else 0.0
    loss_rate = 100.0 - win_rate
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")
    expectancy = net_profit / len(trades)
    avg_trade = expectancy
    avg_winner = sum(winners) / len(winners) if winners else 0.0
    avg_loser = sum(losers) / len(losers) if losers else 0.0

    max_dd, max_dd_pct = _max_drawdown(equity_curve)
    final_capital = equity_curve[-1]["equity"] if equity_curve else initial_capital
    recovery_factor = net_profit / max_dd if max_dd > 0 else float("inf")

    returns = _period_returns(equity_curve)
    sharpe = _sharpe(returns)
    sortino = _sortino(returns)
    calmar = (net_profit / initial_capital) / max_dd_pct if max_dd_pct > 0 else 0.0

    consec_wins, consec_losses = _consecutive_streaks(pnls)
    avg_holding = sum(t.bars_held for t in trades) / len(trades)

    monthly = _group_returns(trades, "month")
    yearly = _group_returns(trades, "year")

    return {
        "net_profit": round(net_profit, 4),
        "gross_profit": round(gross_profit, 4),
        "gross_loss": round(gross_loss, 4),
        "win_rate": round(win_rate, 2),
        "loss_rate": round(loss_rate, 2),
        "profit_factor": round(profit_factor, 4) if profit_factor != float("inf") else None,
        "expectancy": round(expectancy, 4),
        "average_trade": round(avg_trade, 4),
        "average_winner": round(avg_winner, 4),
        "average_loser": round(avg_loser, 4),
        "maximum_drawdown": round(max_dd, 4),
        "maximum_drawdown_pct": round(max_dd_pct * 100, 4),
        "recovery_factor": round(recovery_factor, 4) if recovery_factor != float("inf") else None,
        "sharpe_ratio": round(sharpe, 4),
        "sortino_ratio": round(sortino, 4),
        "calmar_ratio": round(calmar, 4),
        "consecutive_wins_max": consec_wins,
        "consecutive_losses_max": consec_losses,
        "average_holding_bars": round(avg_holding, 2),
        "total_trades": len(trades),
        "initial_capital": round(initial_capital, 4),
        "final_capital": round(final_capital, 4),
        "monthly_returns": monthly,
        "yearly_returns": yearly,
    }


def _empty_metrics(initial_capital: float) -> dict[str, Any]:
    return {
        "net_profit": 0.0,
        "gross_profit": 0.0,
        "gross_loss": 0.0,
        "win_rate": 0.0,
        "loss_rate": 0.0,
        "profit_factor": None,
        "expectancy": 0.0,
        "average_trade": 0.0,
        "average_winner": 0.0,
        "average_loser": 0.0,
        "maximum_drawdown": 0.0,
        "maximum_drawdown_pct": 0.0,
        "recovery_factor": None,
        "sharpe_ratio": 0.0,
        "sortino_ratio": 0.0,
        "calmar_ratio": 0.0,
        "consecutive_wins_max": 0,
        "consecutive_losses_max": 0,
        "average_holding_bars": 0.0,
        "total_trades": 0,
        "initial_capital": initial_capital,
        "final_capital": initial_capital,
        "monthly_returns": {},
        "yearly_returns": {},
    }


def _max_drawdown(equity_curve: list[dict[str, Any]]) -> tuple[float, float]:
    peak = 0.0
    max_dd = 0.0
    max_dd_pct = 0.0
    for point in equity_curve:
        eq = float(point["equity"])
        peak = max(peak, eq)
        dd = peak - eq
        max_dd = max(max_dd, dd)
        if peak > 0:
            max_dd_pct = max(max_dd_pct, dd / peak)
    return max_dd, max_dd_pct


def _period_returns(equity_curve: list[dict[str, Any]]) -> list[float]:
    if len(equity_curve) < 2:
        return []
    returns: list[float] = []
    for i in range(1, len(equity_curve)):
        prev = float(equity_curve[i - 1]["equity"])
        curr = float(equity_curve[i]["equity"])
        if prev > 0:
            returns.append((curr - prev) / prev)
    return returns


def _sharpe(returns: list[float], risk_free: float = 0.0) -> float:
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns) - risk_free
    variance = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    std = math.sqrt(variance) if variance > 0 else 0.0
    return (mean / std) * math.sqrt(252) if std > 0 else 0.0


def _sortino(returns: list[float], risk_free: float = 0.0) -> float:
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns) - risk_free
    downside = [min(0.0, r - risk_free) ** 2 for r in returns]
    down_std = math.sqrt(sum(downside) / len(downside)) if downside else 0.0
    return (mean / down_std) * math.sqrt(252) if down_std > 0 else 0.0


def _consecutive_streaks(pnls: list[float]) -> tuple[int, int]:
    max_w = max_l = cur_w = cur_l = 0
    for p in pnls:
        if p > 0:
            cur_w += 1
            cur_l = 0
        else:
            cur_l += 1
            cur_w = 0
        max_w = max(max_w, cur_w)
        max_l = max(max_l, cur_l)
    return max_w, max_l


def _group_returns(trades: list[SimulatedTrade], period: str) -> dict[str, float]:
    buckets: dict[str, float] = defaultdict(float)
    for t in trades:
        if t.exit_time is None:
            continue
        key = (
            t.exit_time.strftime("%Y-%m")
            if period == "month"
            else t.exit_time.strftime("%Y")
        )
        buckets[key] += t.pnl
    return {k: round(v, 4) for k, v in sorted(buckets.items())}
