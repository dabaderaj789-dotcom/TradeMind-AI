"""Normalize Yahoo chart payloads into domain candles."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.adapters.nse.bar_align import merge_candle_ohlc, snap_bar_open
from app.domain.entities.candle import Candle
from app.domain.value_objects.timeframe import Timeframe


def normalize_yahoo_chart(
    payload: dict,
    timeframe: Timeframe,
    symbol_code: str,
    *,
    nse: bool = True,
) -> list[Candle]:
    """Convert Yahoo v8 chart result to domain candles.

    Open times are snapped to the timeframe grid so Yahoo's forming-tip "now"
    stamps do not create junk rows.

    - ``nse=True`` (default): NSE cash session grid from 09:15 IST
    - ``nse=False``: UTC epoch grid (forex / metals / 24h instruments)
    """
    try:
        result = payload["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        return []

    timestamps: list[int] = result.get("timestamp") or []
    quote = (result.get("indicators") or {}).get("quote") or [{}]
    q0 = quote[0] if quote else {}
    opens = q0.get("open") or []
    highs = q0.get("high") or []
    lows = q0.get("low") or []
    closes = q0.get("close") or []
    volumes = q0.get("volume") or []

    seconds = timeframe.seconds
    now = datetime.now(UTC)
    buckets: dict[datetime, dict[str, float]] = {}

    for i, ts in enumerate(timestamps):
        o = _f(opens[i] if i < len(opens) else None)
        h = _f(highs[i] if i < len(highs) else None)
        low = _f(lows[i] if i < len(lows) else None)
        c = _f(closes[i] if i < len(closes) else None)
        if None in (o, h, low, c):
            continue
        raw_open = datetime.fromtimestamp(ts, tz=UTC)
        open_time = snap_bar_open(raw_open, seconds, nse=nse)
        vol = _f(volumes[i] if i < len(volumes) else 0) or 0.0
        slot = buckets.get(open_time)
        if slot is None:
            buckets[open_time] = {
                "open": o,
                "high": h,
                "low": low,
                "close": c,
                "volume": vol,
            }
        else:
            merge_candle_ohlc(slot, o, h, low, c, vol)

    out: list[Candle] = []
    for open_time in sorted(buckets.keys()):
        slot = buckets[open_time]
        close_time = open_time + timedelta(seconds=seconds) - timedelta(milliseconds=1)
        # Forming tip is incomplete when its close is still in the future.
        is_complete = close_time < now
        out.append(
            Candle(
                symbol_code=symbol_code,
                timeframe_code=timeframe.code,
                open_time=open_time,
                close_time=close_time,
                open=Decimal(str(slot["open"])),
                high=Decimal(str(slot["high"])),
                low=Decimal(str(slot["low"])),
                close=Decimal(str(slot["close"])),
                volume=Decimal(str(slot["volume"])),
                is_complete=is_complete,
                source="nse",
            )
        )
    return out


def _f(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
