"""Snap candle open times to canonical NSE / UTC bar boundaries.

Yahoo often stamps the *forming* intraday tip with wall-clock "now" instead of
the bar open. Without snapping, each download inserts a new open_time and the
chart tip freezes / looks like scattered ticks.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

IST = timedelta(hours=5, minutes=30)


def snap_bar_open(open_time: datetime, tf_seconds: int, *, nse: bool) -> datetime:
    """Return canonical bar open (UTC) for ``open_time``."""
    if open_time.tzinfo is None:
        open_time = open_time.replace(tzinfo=UTC)
    else:
        open_time = open_time.astimezone(UTC)

    if tf_seconds <= 0:
        return open_time

    if not nse or tf_seconds >= 86400:
        # Daily+: keep calendar day UTC midnight for non-NSE; NSE daily uses session.
        if nse and tf_seconds >= 86400:
            ist = open_time + IST
            session = ist.replace(hour=9, minute=15, second=0, microsecond=0)
            return (session - IST).replace(tzinfo=UTC)
        epoch = int(open_time.timestamp())
        snapped = epoch - (epoch % tf_seconds)
        return datetime.fromtimestamp(snapped, tz=UTC)

    ist = open_time + IST
    # Weekends — still snap within the IST day grid from 09:15
    session = ist.replace(hour=9, minute=15, second=0, microsecond=0)
    close = ist.replace(hour=15, minute=30, second=0, microsecond=0)
    if ist < session:
        return (session - IST).replace(tzinfo=UTC)
    if ist >= close:
        # Last bar of the session
        elapsed_last = int((close - session).total_seconds()) - tf_seconds
        elapsed_last = max(0, elapsed_last - (elapsed_last % tf_seconds))
        snapped_ist = session + timedelta(seconds=elapsed_last)
        return (snapped_ist - IST).replace(tzinfo=UTC)

    elapsed = int((ist - session).total_seconds())
    bucket = elapsed - (elapsed % tf_seconds)
    snapped_ist = session + timedelta(seconds=bucket)
    return (snapped_ist - IST).replace(tzinfo=UTC)


def merge_candle_ohlc(into: dict, open_: float, high: float, low: float, close: float, volume: float) -> None:
    if "open" not in into:
        into["open"] = open_
        into["high"] = high
        into["low"] = low
        into["close"] = close
        into["volume"] = volume
        return
    into["high"] = max(into["high"], high, open_, close)
    into["low"] = min(into["low"], low, open_, close)
    into["close"] = close
    into["volume"] = float(into.get("volume") or 0) + volume
