"""Liquidity Sweep internal types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4


class SweepType(StrEnum):
    BUY_SIDE = "buy_side"
    SELL_SIDE = "sell_side"


class LevelType(StrEnum):
    SWING_HIGH = "swing_high"
    SWING_LOW = "swing_low"
    EQUAL_HIGH = "equal_high"
    EQUAL_LOW = "equal_low"
    SESSION_HIGH = "session_high"
    SESSION_LOW = "session_low"


class SweepStatus(StrEnum):
    ACTIVE = "active"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    INVALIDATED = "invalidated"


@dataclass
class LiquidityLevel:
    price: float
    level_type: LevelType
    source_index: int
    created_at: datetime
    touch_count: int = 1


@dataclass
class StrengthComponents:
    penetration_depth: float = 0.0
    rejection_strength: float = 0.0
    volume: float = 0.0
    atr: float = 0.0
    market_structure_context: float = 0.0
    smart_money_context: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "penetration_depth": round(self.penetration_depth, 2),
            "rejection_strength": round(self.rejection_strength, 2),
            "volume": round(self.volume, 2),
            "atr": round(self.atr, 2),
            "market_structure_context": round(self.market_structure_context, 2),
            "smart_money_context": round(self.smart_money_context, 2),
        }


@dataclass
class ConfirmationComponents:
    immediate_rejection: float = 0.0
    volume_expansion: float = 0.0
    atr_expansion: float = 0.0
    bos_confirmation: float = 0.0
    choch_confirmation: float = 0.0
    order_block_proximity: float = 0.0
    fvg_proximity: float = 0.0
    trend_alignment: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "immediate_rejection": round(self.immediate_rejection, 2),
            "volume_expansion": round(self.volume_expansion, 2),
            "atr_expansion": round(self.atr_expansion, 2),
            "bos_confirmation": round(self.bos_confirmation, 2),
            "choch_confirmation": round(self.choch_confirmation, 2),
            "order_block_proximity": round(self.order_block_proximity, 2),
            "fvg_proximity": round(self.fvg_proximity, 2),
            "trend_alignment": round(self.trend_alignment, 2),
        }


@dataclass
class LiquiditySweep:
    sweep_id: str
    sweep_type: SweepType
    sweep_level: float
    level_type: LevelType
    penetration_depth: float
    created_at: datetime
    created_index: int
    sweep_bar_extreme: float
    timeframe_code: str
    status: SweepStatus = SweepStatus.ACTIVE
    strength_score: float = 0.0
    strength_components: StrengthComponents = field(default_factory=StrengthComponents)
    confirmation_components: ConfirmationComponents = field(default_factory=ConfirmationComponents)
    confidence: float = 0.0
    explanation: str = ""
    trend: str = "sideways"
    market_phase: str = "ranging"
    associated_bos: dict[str, Any] | None = None
    associated_choch: dict[str, Any] | None = None
    related_order_block_id: str | None = None
    related_fvg_id: str | None = None
    nearest_swing_index: int | None = None
    nearest_swing_price: float | None = None
    lifecycle_events: list[dict[str, Any]] = field(default_factory=list)
    confirmed_at: datetime | None = None
    failed_at: datetime | None = None
    invalidated_at: datetime | None = None
    _level_key: str = field(default="", repr=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sweep_id": self.sweep_id,
            "type": self.sweep_type.value,
            "sweep_level": round(self.sweep_level, 8),
            "level_type": self.level_type.value,
            "penetration_depth": round(self.penetration_depth, 8),
            "status": self.status.value,
            "strength_score": round(self.strength_score, 2),
            "strength_components": self.strength_components.to_dict(),
            "confirmation_components": self.confirmation_components.to_dict(),
            "confidence": round(self.confidence, 4),
            "explanation": self.explanation,
            "created_at": self.created_at.isoformat(),
            "created_index": self.created_index,
            "sweep_bar_extreme": round(self.sweep_bar_extreme, 8),
            "timeframe_code": self.timeframe_code,
            "trend": self.trend,
            "market_phase": self.market_phase,
            "associated_bos": self.associated_bos,
            "associated_choch": self.associated_choch,
            "related_order_block_id": self.related_order_block_id,
            "related_fvg_id": self.related_fvg_id,
            "nearest_swing_index": self.nearest_swing_index,
            "nearest_swing_price": (
                round(self.nearest_swing_price, 8) if self.nearest_swing_price is not None else None
            ),
            "lifecycle_events": self.lifecycle_events,
            "confirmed_at": self.confirmed_at.isoformat() if self.confirmed_at else None,
            "failed_at": self.failed_at.isoformat() if self.failed_at else None,
            "invalidated_at": self.invalidated_at.isoformat() if self.invalidated_at else None,
        }


@dataclass
class BarLiquiditySweepState:
    active_sweeps: list[LiquiditySweep] = field(default_factory=list)
    new_sweeps: list[LiquiditySweep] = field(default_factory=list)
    confirmed_this_bar: list[LiquiditySweep] = field(default_factory=list)
    failed_this_bar: list[LiquiditySweep] = field(default_factory=list)
    invalidated_this_bar: list[LiquiditySweep] = field(default_factory=list)

    def to_values(self, timeframe_code: str) -> dict[str, Any]:
        return {
            "timeframe_code": timeframe_code,
            "active_sweeps": [s.to_dict() for s in self.active_sweeps],
            "new_sweeps": [s.to_dict() for s in self.new_sweeps],
            "confirmed_sweeps": [s.to_dict() for s in self.confirmed_this_bar],
            "failed_sweeps": [s.to_dict() for s in self.failed_this_bar],
            "invalidated_sweeps": [s.to_dict() for s in self.invalidated_this_bar],
            "active_count": len(self.active_sweeps),
            "confidence": round(
                sum(s.confidence for s in self.active_sweeps) / len(self.active_sweeps), 4
            )
            if self.active_sweeps
            else 0.0,
        }


def new_sweep_id() -> str:
    return uuid4().hex[:16]
