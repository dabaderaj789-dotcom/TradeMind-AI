"""Shared numerical helpers for analysis plugins.

These are pure math utilities — not plugins. Individual plugins remain independent.
"""

from __future__ import annotations


def sma(values: list[float], period: int) -> list[float | None]:
    """Simple moving average."""
    out: list[float | None] = [None] * len(values)
    if period <= 0:
        return out
    running = 0.0
    for i, v in enumerate(values):
        running += v
        if i >= period:
            running -= values[i - period]
        if i >= period - 1:
            out[i] = running / period
    return out


def ema(values: list[float], period: int) -> list[float | None]:
    """Exponential moving average (span=period)."""
    out: list[float | None] = [None] * len(values)
    if period <= 0 or not values:
        return out
    multiplier = 2.0 / (period + 1)
    ema_val: float | None = None
    for i, v in enumerate(values):
        if ema_val is None:
            if i >= period - 1:
                ema_val = sum(values[i - period + 1 : i + 1]) / period
                out[i] = ema_val
        else:
            ema_val = (v - ema_val) * multiplier + ema_val
            out[i] = ema_val
    return out


def true_range(highs: list[float], lows: list[float], closes: list[float]) -> list[float]:
    """True range series (first bar uses high-low only)."""
    tr: list[float] = []
    for i in range(len(highs)):
        if i == 0:
            tr.append(highs[i] - lows[i])
        else:
            tr.append(
                max(
                    highs[i] - lows[i],
                    abs(highs[i] - closes[i - 1]),
                    abs(lows[i] - closes[i - 1]),
                )
            )
    return tr
