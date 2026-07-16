"""Normalize Yahoo chart payloads into domain candles."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.domain.entities.candle import Candle
from app.domain.value_objects.timeframe import Timeframe


def normalize_yahoo_chart(payload: dict, timeframe: Timeframe, symbol_code: str) -> list[Candle]:
    """Convert Yahoo v8 chart result to domain candles."""
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
    out: list[Candle] = []
    for i, ts in enumerate(timestamps):
        o = _dec(opens[i] if i < len(opens) else None)
        h = _dec(highs[i] if i < len(highs) else None)
        low = _dec(lows[i] if i < len(lows) else None)
        c = _dec(closes[i] if i < len(closes) else None)
        if None in (o, h, low, c):
            continue
        open_time = datetime.fromtimestamp(ts, tz=UTC)
        close_time = open_time + timedelta(seconds=seconds) - timedelta(milliseconds=1)
        vol = _dec(volumes[i] if i < len(volumes) else 0) or Decimal("0")
        out.append(
            Candle(
                symbol_code=symbol_code,
                timeframe_code=timeframe.code,
                open_time=open_time,
                close_time=close_time,
                open=o,
                high=h,
                low=low,
                close=c,
                volume=vol,
                is_complete=True,
                source="nse",
            )
        )
    return out


def _dec(value: object) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None
