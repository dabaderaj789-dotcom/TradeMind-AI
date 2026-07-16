"""Internal types for market structure analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class SwingLabel(StrEnum):
    HH = "HH"
    HL = "HL"
    LH = "LH"
    LL = "LL"


class Trend(StrEnum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    SIDEWAYS = "sideways"


class MarketPhase(StrEnum):
    TRENDING = "trending"
    RANGING = "ranging"
    ACCUMULATION = "accumulation"
    DISTRIBUTION = "distribution"


@dataclass
class SwingPoint:
    index: int
    open_time: datetime
    price: float
    is_high: bool
    label: SwingLabel | None = None
    strength: float = 0.0
    volume: float = 0.0


@dataclass
class StructureEvent:
    event_type: str  # bos_bullish, bos_bearish, choch_bullish, choch_bearish
    broken_swing_price: float
    break_price: float
    break_time: datetime
    break_index: int
    swing_index: int


@dataclass
class DynamicLevel:
    price: float
    strength: float
    touches: int
    created_at: datetime
    last_validated_at: datetime
    is_support: bool

    def to_dict(self) -> dict:
        return {
            "price": round(self.price, 8),
            "strength": round(self.strength, 4),
            "touches": self.touches,
            "created_at": self.created_at.isoformat(),
            "last_validated_at": self.last_validated_at.isoformat(),
        }


@dataclass
class BarStructureState:
    """Per-bar market structure output."""

    trend: Trend = Trend.SIDEWAYS
    swing_type: SwingLabel | None = None
    swing_strength: float | None = None
    is_swing_high: bool = False
    is_swing_low: bool = False
    bos: StructureEvent | None = None
    choch: StructureEvent | None = None
    market_phase: MarketPhase = MarketPhase.RANGING
    phase_confidence: float = 0.0
    confidence: float = 0.0
    support_levels: list[DynamicLevel] = field(default_factory=list)
    resistance_levels: list[DynamicLevel] = field(default_factory=list)

    def to_values(self) -> dict:
        return {
            "trend": self.trend.value,
            "swing_type": self.swing_type.value if self.swing_type else None,
            "swing_strength": self.swing_strength,
            "is_swing_high": self.is_swing_high,
            "is_swing_low": self.is_swing_low,
            "bos": _event_to_dict(self.bos),
            "choch": _event_to_dict(self.choch),
            "market_phase": self.market_phase.value,
            "phase_confidence": round(self.phase_confidence, 4),
            "confidence": round(self.confidence, 4),
            "support_levels": [lvl.to_dict() for lvl in self.support_levels],
            "resistance_levels": [lvl.to_dict() for lvl in self.resistance_levels],
        }


def _event_to_dict(event: StructureEvent | None) -> dict | None:
    if event is None:
        return None
    return {
        "type": event.event_type,
        "broken_swing_price": round(event.broken_swing_price, 8),
        "break_price": round(event.break_price, 8),
        "break_time": event.break_time.isoformat(),
        "break_index": event.break_index,
        "swing_index": event.swing_index,
    }
