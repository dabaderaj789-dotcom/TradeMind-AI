"""Integration tests for Strategy + Backtesting pipeline."""

from datetime import UTC, datetime, timedelta

from app.engines.analysis.types import CandleBar
from app.engines.backtesting.engine import BacktestEngine
from app.engines.backtesting.reports import compare_strategies
from app.engines.backtesting.types import BacktestConfig, BacktestInput
from app.engines.strategy.engine import StrategyEngine
from app.engines.strategy.registry import init_strategies
from app.engines.strategy.strategies.breakout import BreakoutStrategy
from app.engines.strategy.strategies.pullback import PullbackStrategy
from app.engines.strategy.strategies.trend_continuation import TrendContinuationStrategy
from app.engines.strategy.types import SetupInput, TradePlan


def _candles(n: int = 120) -> list[CandleBar]:
    start = datetime(2024, 6, 1, tzinfo=UTC)
    bars: list[CandleBar] = []
    for i in range(n):
        t = start + timedelta(hours=i)
        p = 100.0 + i * 0.3
        bars.append(
            CandleBar(
                open_time=t,
                open=p,
                high=p + 1.5,
                low=p - 0.8,
                close=p + 0.4,
                volume=2000 + i,
            )
        )
    return bars


def _trend_setup(detected_at: datetime) -> SetupInput:
    return SetupInput(
        setup_id="int-setup-tc",
        setup_type="trend_continuation",
        direction="bullish",
        confidence_score=72.0,
        confidence_level="high",
        evidence_scores={
            "trend_alignment_bullish": 80.0,
            "fresh_order_block_bullish": 65.0,
            "open_fvg_bullish": 55.0,
        },
        entry_zone={"high": 105.0, "low": 104.0},
        stop_loss_zone={"high": 104.0, "low": 102.0},
        target_zones=[
            {"high": 111.0, "low": 110.5, "label": "target_1"},
            {"high": 115.0, "low": 114.5, "label": "target_2"},
        ],
        risk_reward=2.0,
        explanation="Integration trend setup",
        reference_ids={},
        detected_at=detected_at,
    )


def test_strategy_to_backtest_pipeline() -> None:
    init_strategies()
    candles = _candles(80)
    setup = _trend_setup(candles[10].open_time)
    strategy = TrendContinuationStrategy()
    engine = StrategyEngine()
    _, plan = engine.evaluate(strategy, setup, {"min_strategy_confidence": 50.0})
    assert plan is not None

    bt = BacktestEngine().run(
        BacktestInput(candles=candles, plans=[plan]),
        BacktestConfig(initial_capital=10_000, order_type="market"),
    )
    report = BacktestEngine().build_report(bt)
    assert report["performance_summary"]["total_trades"] >= 0
    assert report["drawdown_analysis"]["maximum_drawdown"] >= 0


def test_multiple_strategies_comparison() -> None:
    candles = _candles(100)
    detected = candles[15].open_time

    tc_setup = _trend_setup(detected)
    pb_setup = SetupInput(
        setup_id="int-setup-pb",
        setup_type="pullback",
        direction="bullish",
        confidence_score=68.0,
        confidence_level="medium",
        evidence_scores={
            "market_structure_confidence": 70.0,
            "mitigated_order_block_bullish": 60.0,
        },
        entry_zone={"high": 104.5, "low": 103.5},
        stop_loss_zone={"high": 103.5, "low": 101.5},
        target_zones=[{"high": 111.0, "low": 110.5}],
        risk_reward=1.8,
        explanation="Pullback integration",
        reference_ids={"order_block_id": "ob-1"},
        detected_at=detected,
    )
    bo_setup = SetupInput(
        setup_id="int-setup-bo",
        setup_type="breakout",
        direction="bullish",
        confidence_score=70.0,
        confidence_level="high",
        evidence_scores={"bullish_bos": 75.0, "volume_confirmation": 60.0},
        entry_zone={"high": 106.0, "low": 105.0},
        stop_loss_zone={"high": 105.0, "low": 103.0},
        target_zones=[{"high": 112.0, "low": 111.0}],
        risk_reward=2.0,
        explanation="Breakout integration",
        reference_ids={},
        detected_at=detected,
    )

    se = StrategyEngine()
    reports: dict[str, dict] = {}
    for strat, setup in [
        (TrendContinuationStrategy(), tc_setup),
        (PullbackStrategy(), pb_setup),
        (BreakoutStrategy(), bo_setup),
    ):
        _, plan = se.evaluate(strat, setup, {"min_strategy_confidence": 50.0})
        if plan is None:
            continue
        result = BacktestEngine().run(
            BacktestInput(candles=candles, plans=[plan]),
            BacktestConfig(initial_capital=10_000, order_type="market"),
        )
        reports[strat.strategy_id()] = BacktestEngine().build_report(result)

    comparison = compare_strategies(reports)
    assert len(comparison) == len(reports)
    assert all("net_profit" in row for row in comparison)
