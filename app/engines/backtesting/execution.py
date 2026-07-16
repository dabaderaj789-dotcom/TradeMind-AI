"""Order execution simulation with costs."""

from __future__ import annotations

from app.engines.analysis.types import CandleBar
from app.engines.backtesting.position_sizing import round_to_tick
from app.engines.backtesting.types import BacktestConfig, OrderType
from app.engines.strategy.types import TradePlan


def apply_slippage(price: float, direction: str, *, is_entry: bool, config: BacktestConfig) -> float:
    slip = price * config.slippage_pct
    spread_half = config.spread / 2.0
    if direction == "bullish":
        return price + slip + spread_half if is_entry else price - slip - spread_half
    return price - slip - spread_half if is_entry else price + slip + spread_half


def commission_cost(notional: float, config: BacktestConfig) -> float:
    return abs(notional) * config.commission_pct + config.trading_fee_flat


def try_fill_entry(
    bar: CandleBar,
    plan: TradePlan,
    config: BacktestConfig,
) -> float | None:
    order_type = config.order_type
    entry_low = plan.entry_zone_low
    entry_high = plan.entry_zone_high

    if order_type == OrderType.MARKET.value:
        price = bar.open
        return round_to_tick(
            apply_slippage(price, plan.direction, is_entry=True, config=config),
            config.tick_size,
        )

    if order_type == OrderType.LIMIT.value:
        if bar.low <= entry_high and bar.high >= entry_low:
            price = entry_low if plan.direction == "bullish" else entry_high
            return round_to_tick(
                apply_slippage(price, plan.direction, is_entry=True, config=config),
                config.tick_size,
            )
        return None

    if order_type == OrderType.STOP.value:
        trigger = entry_high if plan.direction == "bullish" else entry_low
        if plan.direction == "bullish" and bar.high >= trigger:
            return round_to_tick(
                apply_slippage(trigger, plan.direction, is_entry=True, config=config),
                config.tick_size,
            )
        if plan.direction == "bearish" and bar.low <= trigger:
            return round_to_tick(
                apply_slippage(trigger, plan.direction, is_entry=True, config=config),
                config.tick_size,
            )
    return None
