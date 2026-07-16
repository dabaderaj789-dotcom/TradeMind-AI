"""Trade Setup Engine domain types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4


ENGINE_VERSION = "1.0.0"


class SetupType(StrEnum):
    TREND_CONTINUATION = "trend_continuation"
    PULLBACK = "pullback"
    BREAKOUT = "breakout"
    REVERSAL = "reversal"
    RANGE_REJECTION = "range_rejection"


class SetupDirection(StrEnum):
    BULLISH = "bullish"
    BEARISH = "bearish"


class SetupStatus(StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    INVALIDATED = "invalidated"


class ConfidenceLevel(StrEnum):
    VERY_HIGH = "very_high"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class PriceZone:
    high: float
    low: float
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"high": round(self.high, 8), "low": round(self.low, 8), "label": self.label}


@dataclass
class BarAnalysisContext:
    """Aligned per-bar snapshot from all source plugins."""

    open_time: datetime
    bar_index: int
    close: float
    high: float
    low: float
    volume: float
    market_structure: dict[str, Any] = field(default_factory=dict)
    order_blocks: dict[str, Any] = field(default_factory=dict)
    fair_value_gaps: dict[str, Any] = field(default_factory=dict)
    liquidity_sweeps: dict[str, Any] = field(default_factory=dict)
    rsi: float | None = None
    vwap: float | None = None
    atr: float | None = None


@dataclass
class TradeSetupCandidate:
    setup_type: SetupType
    direction: SetupDirection
    evidence_scores: dict[str, float]
    entry_zone: PriceZone
    stop_loss_zone: PriceZone
    target_zones: list[PriceZone]
    explanation: str
    detected_at: datetime
    detected_index: int
    reference_ids: dict[str, str | None] = field(default_factory=dict)

    @property
    def risk_reward(self) -> float | None:
        entry_mid = (self.entry_zone.high + self.entry_zone.low) / 2
        stop_mid = (self.stop_loss_zone.high + self.stop_loss_zone.low) / 2
        risk = abs(entry_mid - stop_mid)
        if risk <= 0 or not self.target_zones:
            return None
        target_mid = (self.target_zones[0].high + self.target_zones[0].low) / 2
        reward = abs(target_mid - entry_mid)
        return round(reward / risk, 2)


@dataclass
class ScoredTradeSetup:
    setup_id: str
    setup_type: SetupType
    direction: SetupDirection
    confidence_score: float
    confidence_level: ConfidenceLevel
    evidence_scores: dict[str, float]
    entry_zone: PriceZone
    stop_loss_zone: PriceZone
    target_zones: list[PriceZone]
    risk_reward: float | None
    explanation: str
    detected_at: datetime
    detected_index: int
    expires_index: int
    status: SetupStatus = SetupStatus.ACTIVE
    reference_ids: dict[str, str | None] = field(default_factory=dict)

    def to_persist_dict(self, *, timeframe_code: str) -> dict[str, Any]:
        return {
            "setup_id": self.setup_id,
            "setup_type": self.setup_type.value,
            "direction": self.direction.value,
            "confidence_score": round(self.confidence_score, 2),
            "confidence_level": self.confidence_level.value,
            "evidence_scores": {k: round(v, 2) for k, v in self.evidence_scores.items()},
            "entry_zone": self.entry_zone.to_dict(),
            "stop_loss_zone": self.stop_loss_zone.to_dict(),
            "target_zones": [z.to_dict() for z in self.target_zones],
            "risk_reward": self.risk_reward,
            "explanation": self.explanation,
            "detected_at": self.detected_at.isoformat(),
            "detected_index": self.detected_index,
            "expires_index": self.expires_index,
            "status": self.status.value,
            "timeframe_code": timeframe_code,
            "reference_ids": self.reference_ids,
        }


def new_setup_id() -> str:
    return uuid4().hex[:16]


def confidence_level_from_score(score: float) -> ConfidenceLevel:
    if score >= 85:
        return ConfidenceLevel.VERY_HIGH
    if score >= 70:
        return ConfidenceLevel.HIGH
    if score >= 50:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW
