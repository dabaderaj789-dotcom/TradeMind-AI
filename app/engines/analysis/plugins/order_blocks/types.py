"""Order Block internal types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4


class OrderBlockType(StrEnum):
    BULLISH = "bullish"
    BEARISH = "bearish"


class OrderBlockStatus(StrEnum):
    FRESH = "fresh"
    MITIGATED = "mitigated"
    INVALIDATED = "invalidated"


class MitigationState(StrEnum):
    UNTOUCHED = "untouched"
    FIRST_TOUCH = "first_touch"
    PARTIALLY_MITIGATED = "partially_mitigated"
    FULLY_MITIGATED = "fully_mitigated"


@dataclass
class StrengthComponents:
    bos_strength: float = 0.0
    volume_ratio: float = 0.0
    atr_expansion: float = 0.0
    impulse_move: float = 0.0
    age_factor: float = 0.0
    reaction_count: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "bos_strength": round(self.bos_strength, 2),
            "volume_ratio": round(self.volume_ratio, 2),
            "atr_expansion": round(self.atr_expansion, 2),
            "impulse_move": round(self.impulse_move, 2),
            "age_factor": round(self.age_factor, 2),
            "reaction_count": round(self.reaction_count, 2),
        }


@dataclass
class OrderBlock:
    order_block_id: str
    block_type: OrderBlockType
    zone_high: float
    zone_low: float
    created_at: datetime
    created_index: int
    source_candle_indices: list[int]
    bos_index: int
    bos_break_price: float
    bos_broken_swing_price: float
    timeframe_code: str
    status: OrderBlockStatus = OrderBlockStatus.FRESH
    mitigation_state: MitigationState = MitigationState.UNTOUCHED
    touch_count: int = 0
    strength_score: float = 0.0
    strength_components: StrengthComponents = field(default_factory=StrengthComponents)
    confidence: float = 0.0
    explanation: str = ""
    invalidation_at: datetime | None = None
    invalidation_reason: str | None = None
    mitigation_events: list[dict[str, Any]] = field(default_factory=list)
    successful_reactions: int = 0

    @property
    def zone_depth(self) -> float:
        return max(self.zone_high - self.zone_low, 1e-12)

    def to_dict(self) -> dict[str, Any]:
        return {
            "order_block_id": self.order_block_id,
            "type": self.block_type.value,
            "zone_high": round(self.zone_high, 8),
            "zone_low": round(self.zone_low, 8),
            "status": self.status.value,
            "mitigation_state": self.mitigation_state.value,
            "touch_count": self.touch_count,
            "strength_score": round(self.strength_score, 2),
            "strength_components": self.strength_components.to_dict(),
            "confidence": round(self.confidence, 4),
            "explanation": self.explanation,
            "created_at": self.created_at.isoformat(),
            "source_candle_indices": self.source_candle_indices,
            "bos_index": self.bos_index,
            "bos_break_price": round(self.bos_break_price, 8),
            "bos_broken_swing_price": round(self.bos_broken_swing_price, 8),
            "timeframe_code": self.timeframe_code,
            "invalidation_at": self.invalidation_at.isoformat() if self.invalidation_at else None,
            "invalidation_reason": self.invalidation_reason,
            "mitigation_events": self.mitigation_events,
            "successful_reactions": self.successful_reactions,
        }


@dataclass
class BarOrderBlockState:
    """Per-bar snapshot of order block analysis."""

    active_blocks: list[OrderBlock] = field(default_factory=list)
    new_blocks: list[OrderBlock] = field(default_factory=list)
    mitigated_this_bar: list[OrderBlock] = field(default_factory=list)
    invalidated_this_bar: list[OrderBlock] = field(default_factory=list)

    def to_values(self, timeframe_code: str) -> dict[str, Any]:
        return {
            "timeframe_code": timeframe_code,
            "active_order_blocks": [b.to_dict() for b in self.active_blocks],
            "new_order_blocks": [b.to_dict() for b in self.new_blocks],
            "mitigated_order_blocks": [b.to_dict() for b in self.mitigated_this_bar],
            "invalidated_order_blocks": [b.to_dict() for b in self.invalidated_this_bar],
            "active_count": len(self.active_blocks),
            "confidence": round(
                sum(b.confidence for b in self.active_blocks) / len(self.active_blocks), 4
            )
            if self.active_blocks
            else 0.0,
        }


def new_order_block_id() -> str:
    return uuid4().hex[:16]
