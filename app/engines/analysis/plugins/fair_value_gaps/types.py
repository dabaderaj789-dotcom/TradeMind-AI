"""Fair Value Gap internal types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4


class FvgType(StrEnum):
    BULLISH = "bullish"
    BEARISH = "bearish"


class FvgStatus(StrEnum):
    OPEN = "open"
    PARTIALLY_FILLED = "partially_filled"
    FULLY_FILLED = "fully_filled"
    INVALIDATED = "invalidated"


class FillState(StrEnum):
    OPEN = "open"
    PARTIALLY_FILLED = "partially_filled"
    FULLY_FILLED = "fully_filled"


@dataclass
class QualityComponents:
    gap_size_atr: float = 0.0
    impulse_strength: float = 0.0
    volume_expansion: float = 0.0
    structure_alignment: float = 0.0
    order_block_proximity: float = 0.0
    trend_alignment: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "gap_size_atr": round(self.gap_size_atr, 2),
            "impulse_strength": round(self.impulse_strength, 2),
            "volume_expansion": round(self.volume_expansion, 2),
            "structure_alignment": round(self.structure_alignment, 2),
            "order_block_proximity": round(self.order_block_proximity, 2),
            "trend_alignment": round(self.trend_alignment, 2),
        }


@dataclass
class FairValueGap:
    fvg_id: str
    fvg_type: FvgType
    gap_high: float
    gap_low: float
    gap_size: float
    gap_percent: float
    created_at: datetime
    created_index: int
    source_candle_indices: list[int]
    timeframe_code: str
    status: FvgStatus = FvgStatus.OPEN
    fill_state: FillState = FillState.OPEN
    quality_score: float = 0.0
    quality_components: QualityComponents = field(default_factory=QualityComponents)
    fill_percentage: float = 0.0
    first_touch_at: datetime | None = None
    full_fill_at: datetime | None = None
    confidence: float = 0.0
    explanation: str = ""
    trend: str = "sideways"
    market_phase: str = "ranging"
    associated_bos: dict[str, Any] | None = None
    associated_choch: dict[str, Any] | None = None
    associated_order_block_id: str | None = None
    order_block_distance_atr: float | None = None
    invalidation_at: datetime | None = None
    invalidation_reason: str | None = None
    _filled_low: float = field(default=0.0, repr=False)
    _filled_high: float = field(default=0.0, repr=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fvg_id": self.fvg_id,
            "type": self.fvg_type.value,
            "gap_high": round(self.gap_high, 8),
            "gap_low": round(self.gap_low, 8),
            "gap_size": round(self.gap_size, 8),
            "gap_percent": round(self.gap_percent, 6),
            "status": self.status.value,
            "fill_state": self.fill_state.value,
            "quality_score": round(self.quality_score, 2),
            "quality_components": self.quality_components.to_dict(),
            "fill_percentage": round(self.fill_percentage, 2),
            "first_touch_at": self.first_touch_at.isoformat() if self.first_touch_at else None,
            "full_fill_at": self.full_fill_at.isoformat() if self.full_fill_at else None,
            "confidence": round(self.confidence, 4),
            "explanation": self.explanation,
            "created_at": self.created_at.isoformat(),
            "source_candle_indices": self.source_candle_indices,
            "timeframe_code": self.timeframe_code,
            "trend": self.trend,
            "market_phase": self.market_phase,
            "associated_bos": self.associated_bos,
            "associated_choch": self.associated_choch,
            "associated_order_block_id": self.associated_order_block_id,
            "order_block_distance_atr": (
                round(self.order_block_distance_atr, 4)
                if self.order_block_distance_atr is not None
                else None
            ),
            "invalidation_at": self.invalidation_at.isoformat() if self.invalidation_at else None,
            "invalidation_reason": self.invalidation_reason,
        }


@dataclass
class BarFvgState:
    active_fvgs: list[FairValueGap] = field(default_factory=list)
    new_fvgs: list[FairValueGap] = field(default_factory=list)
    filled_this_bar: list[FairValueGap] = field(default_factory=list)
    invalidated_this_bar: list[FairValueGap] = field(default_factory=list)

    def to_values(self, timeframe_code: str) -> dict[str, Any]:
        return {
            "timeframe_code": timeframe_code,
            "active_fvgs": [f.to_dict() for f in self.active_fvgs],
            "new_fvgs": [f.to_dict() for f in self.new_fvgs],
            "filled_fvgs": [f.to_dict() for f in self.filled_this_bar],
            "invalidated_fvgs": [f.to_dict() for f in self.invalidated_this_bar],
            "active_count": len(self.active_fvgs),
            "confidence": round(
                sum(f.confidence for f in self.active_fvgs) / len(self.active_fvgs), 4
            )
            if self.active_fvgs
            else 0.0,
        }


def new_fvg_id() -> str:
    return uuid4().hex[:16]
