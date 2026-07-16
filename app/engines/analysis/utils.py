"""Parameter hashing and candle conversion utilities."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.domain.entities.candle import Candle as DomainCandle
from app.engines.analysis.types import CandleBar
from app.models.candle import Candle as CandleModel


def hash_parameters(parameters: dict[str, Any]) -> str:
    """Deterministic short hash for parameter sets."""
    canonical = json.dumps(parameters, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def candle_model_to_bar(candle: CandleModel) -> CandleBar:
    return CandleBar(
        open_time=candle.open_time,
        close_time=candle.close_time,
        open=float(candle.open),
        high=float(candle.high),
        low=float(candle.low),
        close=float(candle.close),
        volume=float(candle.volume),
    )


def domain_candle_to_bar(candle: DomainCandle) -> CandleBar:
    return CandleBar(
        open_time=candle.open_time,
        close_time=candle.close_time,
        open=float(candle.open),
        high=float(candle.high),
        low=float(candle.low),
        close=float(candle.close),
        volume=float(candle.volume),
    )
