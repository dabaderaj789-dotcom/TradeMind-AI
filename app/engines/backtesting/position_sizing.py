"""Position sizing for backtests."""

from __future__ import annotations

from app.engines.backtesting.types import BacktestConfig, PositionSizingMode


def calculate_position_size(
    *,
    config: BacktestConfig,
    capital: float,
    entry_price: float,
    stop_loss: float,
    atr: float | None = None,
) -> float:
    risk_per_unit = abs(entry_price - stop_loss)
    if risk_per_unit <= 0:
        return 0.0

    mode = config.position_sizing
    if mode == PositionSizingMode.FIXED.value:
        return max(config.fixed_size, 0.0)

    if mode == PositionSizingMode.PERCENT_RISK.value:
        risk_amount = capital * (config.position_risk_pct / 100.0)
        return max(risk_amount / risk_per_unit, 0.0)

    if mode == PositionSizingMode.FIXED_FRACTIONAL.value:
        alloc = capital * (config.fixed_fractional_pct / 100.0)
        return max(alloc / entry_price, 0.0) if entry_price > 0 else 0.0

    if mode == PositionSizingMode.ATR.value and atr and atr > 0:
        risk_amount = capital * (config.position_risk_pct / 100.0)
        atr_stop = atr * config.atr_risk_mult
        return max(risk_amount / atr_stop, 0.0)

    risk_amount = capital * (config.position_risk_pct / 100.0)
    return max(risk_amount / risk_per_unit, 0.0)


def round_to_tick(price: float, tick_size: float) -> float:
    if tick_size <= 0:
        return price
    return round(round(price / tick_size) * tick_size, 8)
