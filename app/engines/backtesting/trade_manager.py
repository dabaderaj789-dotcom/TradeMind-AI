"""Open position trade management."""

from __future__ import annotations

from app.engines.analysis.types import CandleBar
from app.engines.backtesting.execution import apply_slippage, commission_cost
from app.engines.backtesting.position_sizing import round_to_tick
from app.engines.backtesting.types import BacktestConfig, OpenPosition, TradeExitReason


def manage_position(
    pos: OpenPosition,
    bar: CandleBar,
    bar_index: int,
    config: BacktestConfig,
    atr: float | None,
) -> tuple[float, str | None, float]:
    """
    Returns (exit_qty, exit_reason, exit_price) for this bar if exit triggered.
    exit_qty 0 means no full/partial exit this call.
    """
    direction = pos.trade.direction
    stop = pos.stop_loss
    if pos.breakeven_active:
        stop = pos.trade.entry_price

    if pos.trailing_stop is not None:
        stop = pos.trailing_stop

    if config.max_bars_in_trade and (bar_index - pos.entry_bar_index) >= config.max_bars_in_trade:
        price = bar.close
        return pos.remaining_qty, TradeExitReason.TIME_EXIT.value, _exit_price(price, direction, config)

    if direction == "bullish":
        if bar.low <= stop:
            return pos.remaining_qty, _stop_reason(pos), _exit_price(stop, direction, config)
        if not pos.target_1_hit and bar.high >= pos.target_1:
            pos.target_1_hit = True
            if config.move_to_breakeven:
                pos.breakeven_active = True
            partial_qty = pos.remaining_qty * config.partial_take_pct
            if partial_qty > 0 and config.partial_take_pct < 1.0:
                pos.remaining_qty -= partial_qty
                return partial_qty, TradeExitReason.TARGET_1.value, _exit_price(pos.target_1, direction, config)
            return pos.remaining_qty, TradeExitReason.TARGET_1.value, _exit_price(pos.target_1, direction, config)
        if pos.target_1_hit and bar.high >= pos.target_2:
            return pos.remaining_qty, TradeExitReason.TARGET_2.value, _exit_price(pos.target_2, direction, config)
        if pos.target_3 and bar.high >= pos.target_3:
            return pos.remaining_qty, TradeExitReason.TARGET_3.value, _exit_price(pos.target_3, direction, config)
        if config.trailing_stop_atr_mult and atr:
            trail = bar.high - atr * config.trailing_stop_atr_mult
            pos.trailing_stop = max(pos.trailing_stop or stop, trail)
    else:
        if bar.high >= stop:
            return pos.remaining_qty, _stop_reason(pos), _exit_price(stop, direction, config)
        if not pos.target_1_hit and bar.low <= pos.target_1:
            pos.target_1_hit = True
            if config.move_to_breakeven:
                pos.breakeven_active = True
            partial_qty = pos.remaining_qty * config.partial_take_pct
            if partial_qty > 0 and config.partial_take_pct < 1.0:
                pos.remaining_qty -= partial_qty
                return partial_qty, TradeExitReason.TARGET_1.value, _exit_price(pos.target_1, direction, config)
            return pos.remaining_qty, TradeExitReason.TARGET_1.value, _exit_price(pos.target_1, direction, config)
        if pos.target_1_hit and bar.low <= pos.target_2:
            return pos.remaining_qty, TradeExitReason.TARGET_2.value, _exit_price(pos.target_2, direction, config)
        if pos.target_3 and bar.low <= pos.target_3:
            return pos.remaining_qty, TradeExitReason.TARGET_3.value, _exit_price(pos.target_3, direction, config)
        if config.trailing_stop_atr_mult and atr:
            trail = bar.low + atr * config.trailing_stop_atr_mult
            pos.trailing_stop = min(pos.trailing_stop or stop, trail)

    return 0.0, None, 0.0


def _exit_price(price: float, direction: str, config: BacktestConfig) -> float:
    return round_to_tick(
        apply_slippage(price, direction, is_entry=False, config=config),
        config.tick_size,
    )


def _stop_reason(pos: OpenPosition) -> str:
    if pos.breakeven_active and abs(pos.stop_loss - pos.trade.entry_price) < 1e-9:
        return TradeExitReason.BREAKEVEN.value
    if pos.trailing_stop is not None:
        return TradeExitReason.TRAILING_STOP.value
    return TradeExitReason.STOP_LOSS.value
