"""Unit tests for Backtesting Engine."""

from datetime import UTC, datetime, timedelta

from app.engines.analysis.types import CandleBar
from app.engines.backtesting.analytics import compute_performance
from app.engines.backtesting.engine import BacktestEngine
from app.engines.backtesting.types import BacktestConfig, BacktestInput
from app.engines.strategy.types import TradePlan


def _candles(n: int = 50, base: float = 100.0) -> list[CandleBar]:
    start = datetime(2024, 1, 1, tzinfo=UTC)
    bars: list[CandleBar] = []
    for i in range(n):
        t = start + timedelta(hours=i)
        price = base + i * 0.5
        bars.append(
            CandleBar(
                open_time=t,
                open=price,
                high=price + 2,
                low=price - 1,
                close=price + 0.5,
                volume=1000,
            )
        )
    return bars


def _plan(detected_at: datetime) -> TradePlan:
    return TradePlan(
        plan_id="plan-1",
        strategy_id="trend_continuation",
        strategy_version="1.0.0",
        setup_id="setup-1",
        direction="bullish",
        entry_zone_high=100.5,
        entry_zone_low=99.5,
        stop_loss=98.0,
        target_1=104.0,
        target_2=108.0,
        target_3=None,
        risk_reward=2.0,
        trade_expiration_bars=20,
        position_risk_pct=1.0,
        strategy_confidence=75.0,
        reasoning="Test plan",
        detected_at=detected_at,
    )


def test_backtest_runs_and_produces_trades() -> None:
    candles = _candles(40)
    plan = _plan(candles[5].open_time)
    config = BacktestConfig(initial_capital=10_000, order_type="limit", position_sizing="percent_risk")
    result = BacktestEngine().run(
        BacktestInput(candles=candles, plans=[plan]),
        config,
    )
    assert result.bars_processed == 40
    assert result.final_capital != 10_000 or len(result.trades) == 0


def test_replay_consistency() -> None:
    candles = _candles(60)
    plan = _plan(candles[10].open_time)
    config = BacktestConfig(initial_capital=10_000, order_type="market")
    engine = BacktestEngine()
    data = BacktestInput(candles=candles, plans=[plan])
    first = engine.run(data, config)
    second = engine.run(data, config)
    assert len(first.trades) == len(second.trades)
    if first.trades:
        assert first.trades[0].pnl == second.trades[0].pnl
        assert first.final_capital == second.final_capital


def test_analytics_metrics() -> None:
    from app.engines.backtesting.types import SimulatedTrade

    trades = [
        SimulatedTrade(
            trade_id="t1",
            plan_id="p1",
            setup_id="s1",
            direction="bullish",
            entry_time=datetime(2024, 1, 1, tzinfo=UTC),
            exit_time=datetime(2024, 1, 2, tzinfo=UTC),
            entry_price=100.0,
            exit_price=105.0,
            quantity=10.0,
            pnl=50.0,
            pnl_pct=5.0,
            commission=1.0,
            exit_reason="target_1",
            bars_held=5,
        ),
        SimulatedTrade(
            trade_id="t2",
            plan_id="p2",
            setup_id="s2",
            direction="bullish",
            entry_time=datetime(2024, 1, 3, tzinfo=UTC),
            exit_time=datetime(2024, 1, 4, tzinfo=UTC),
            entry_price=100.0,
            exit_price=98.0,
            quantity=10.0,
            pnl=-20.0,
            pnl_pct=-2.0,
            commission=1.0,
            exit_reason="stop_loss",
            bars_held=3,
        ),
    ]
    equity = [
        {"equity": 10_000},
        {"equity": 10_050},
        {"equity": 10_030},
    ]
    metrics = compute_performance(trades, equity, 10_000)
    assert metrics["net_profit"] == 30.0
    assert metrics["win_rate"] == 50.0
    assert metrics["total_trades"] == 2
    assert "sharpe_ratio" in metrics


def test_performance_benchmark() -> None:
    import time

    candles = _candles(5000)
    plans = [_plan(candles[i * 50].open_time) for i in range(1, 20)]
    config = BacktestConfig(initial_capital=10_000)
    start = time.perf_counter()
    BacktestEngine().run(BacktestInput(candles=candles, plans=plans), config)
    elapsed = time.perf_counter() - start
    assert elapsed < 30.0


def test_walk_forward_mode() -> None:
    candles = _candles(800)
    plans = [_plan(candles[i * 100].open_time) for i in range(1, 5)]
    config = BacktestConfig(
        initial_capital=10_000,
        mode="walk_forward",
        walk_forward_train_bars=200,
        walk_forward_test_bars=100,
        walk_forward_step_bars=100,
    )
    result = BacktestEngine().run(BacktestInput(candles=candles, plans=plans), config)
    assert result.bars_processed == 800
    assert isinstance(result.walk_forward_segments, list)


def test_empty_plans_no_trades() -> None:
    candles = _candles(30)
    config = BacktestConfig(initial_capital=10_000)
    result = BacktestEngine().run(BacktestInput(candles=candles, plans=[]), config)
    assert result.trades == []
    assert result.final_capital == 10_000


def test_structured_report_sections() -> None:
    from app.engines.backtesting.reports import build_structured_report

    candles = _candles(40)
    plan = _plan(candles[5].open_time)
    result = BacktestEngine().run(
        BacktestInput(candles=candles, plans=[plan]),
        BacktestConfig(initial_capital=10_000, order_type="market"),
    )
    report = build_structured_report(result)
    assert "performance_summary" in report
    assert "drawdown_analysis" in report
    assert "risk_statistics" in report
    assert "trade_list" in report
