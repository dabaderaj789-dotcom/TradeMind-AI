"""Structured backtest report generation."""

from __future__ import annotations

from typing import Any

from app.engines.backtesting.analytics import compute_performance
from app.engines.backtesting.types import BACKTEST_ENGINE_VERSION, BacktestResult, SimulatedTrade


def trade_to_dict(trade: SimulatedTrade) -> dict[str, Any]:
    return {
        "trade_id": trade.trade_id,
        "plan_id": trade.plan_id,
        "setup_id": trade.setup_id,
        "direction": trade.direction,
        "entry_time": trade.entry_time.isoformat(),
        "exit_time": trade.exit_time.isoformat() if trade.exit_time else None,
        "entry_price": trade.entry_price,
        "exit_price": trade.exit_price,
        "quantity": trade.quantity,
        "pnl": trade.pnl,
        "pnl_pct": trade.pnl_pct,
        "commission": trade.commission,
        "exit_reason": trade.exit_reason,
        "bars_held": trade.bars_held,
        "partial_exits": trade.partial_exits,
    }


def drawdown_analysis(equity_curve: list[dict[str, Any]]) -> dict[str, Any]:
    if not equity_curve:
        return {
            "maximum_drawdown": 0.0,
            "maximum_drawdown_pct": 0.0,
            "drawdown_periods": [],
        }

    peak = float(equity_curve[0]["equity"])
    peak_index = 0
    max_dd = 0.0
    max_dd_pct = 0.0
    periods: list[dict[str, Any]] = []
    in_dd = False
    dd_start: int | None = None

    for i, point in enumerate(equity_curve):
        eq = float(point["equity"])
        if eq >= peak:
            if in_dd and dd_start is not None:
                periods.append({
                    "start_index": dd_start,
                    "end_index": i - 1,
                    "depth": round(peak - min(
                        float(equity_curve[j]["equity"]) for j in range(dd_start, i)
                    ), 4),
                })
                in_dd = False
                dd_start = None
            peak = eq
            peak_index = i
        else:
            dd = peak - eq
            dd_pct = dd / peak if peak > 0 else 0.0
            max_dd = max(max_dd, dd)
            max_dd_pct = max(max_dd_pct, dd_pct)
            if not in_dd:
                in_dd = True
                dd_start = peak_index

    if in_dd and dd_start is not None:
        periods.append({
            "start_index": dd_start,
            "end_index": len(equity_curve) - 1,
            "depth": round(peak - float(equity_curve[-1]["equity"]), 4),
        })

    return {
        "maximum_drawdown": round(max_dd, 4),
        "maximum_drawdown_pct": round(max_dd_pct * 100, 4),
        "drawdown_periods": periods,
    }


def risk_statistics(metrics: dict[str, Any]) -> dict[str, Any]:
    return {
        "sharpe_ratio": metrics.get("sharpe_ratio"),
        "sortino_ratio": metrics.get("sortino_ratio"),
        "calmar_ratio": metrics.get("calmar_ratio"),
        "profit_factor": metrics.get("profit_factor"),
        "recovery_factor": metrics.get("recovery_factor"),
        "maximum_drawdown": metrics.get("maximum_drawdown"),
        "maximum_drawdown_pct": metrics.get("maximum_drawdown_pct"),
        "expectancy": metrics.get("expectancy"),
        "average_winner": metrics.get("average_winner"),
        "average_loser": metrics.get("average_loser"),
        "consecutive_wins_max": metrics.get("consecutive_wins_max"),
        "consecutive_losses_max": metrics.get("consecutive_losses_max"),
    }


def compare_strategies(reports: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Compare performance summaries across strategy backtest reports."""
    rows: list[dict[str, Any]] = []
    for strategy_id, report in reports.items():
        summary = report.get("performance_summary", {})
        rows.append({
            "strategy_id": strategy_id,
            "net_profit": summary.get("net_profit", 0.0),
            "win_rate": summary.get("win_rate", 0.0),
            "profit_factor": summary.get("profit_factor"),
            "sharpe_ratio": summary.get("sharpe_ratio", 0.0),
            "maximum_drawdown": summary.get("maximum_drawdown", 0.0),
            "total_trades": summary.get("total_trades", 0),
        })
    rows.sort(key=lambda r: r.get("net_profit", 0.0), reverse=True)
    return rows


def build_structured_report(result: BacktestResult) -> dict[str, Any]:
    metrics = compute_performance(
        result.trades,
        result.equity_curve,
        result.config.initial_capital,
    )
    dd = drawdown_analysis(result.equity_curve)
    return {
        "engine_version": BACKTEST_ENGINE_VERSION,
        "performance_summary": metrics,
        "trade_list": [trade_to_dict(t) for t in result.trades],
        "monthly_performance": metrics.get("monthly_returns", {}),
        "yearly_performance": metrics.get("yearly_returns", {}),
        "drawdown_analysis": dd,
        "risk_statistics": risk_statistics(metrics),
        "equity_curve": result.equity_curve,
        "walk_forward_segments": result.walk_forward_segments,
        "trade_count": len(result.trades),
        "bars_processed": result.bars_processed,
    }
