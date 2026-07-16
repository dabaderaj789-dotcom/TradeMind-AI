"""Strategy engine domain types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4


class TradeDirection(StrEnum):
    BULLISH = "bullish"
    BEARISH = "bearish"


class PlanStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


@dataclass
class SetupInput:
    """Trade setup consumed by strategies — no raw candle access."""

    setup_id: str
    setup_type: str
    direction: str
    confidence_score: float
    confidence_level: str
    evidence_scores: dict[str, float]
    entry_zone: dict[str, Any]
    stop_loss_zone: dict[str, Any]
    target_zones: list[dict[str, Any]]
    risk_reward: float | None
    explanation: str
    reference_ids: dict[str, Any]
    detected_at: datetime
    expires_index: int = 0
    status: str = "active"

    @classmethod
    def from_record(cls, record: Any) -> SetupInput:
        return cls(
            setup_id=record.setup_id,
            setup_type=record.setup_type,
            direction=record.direction,
            confidence_score=record.confidence_score,
            confidence_level=record.confidence_level,
            evidence_scores=dict(record.evidence_scores or {}),
            entry_zone=dict(record.entry_zone or {}),
            stop_loss_zone=dict(record.stop_loss_zone or {}),
            target_zones=list(record.target_zones or []),
            risk_reward=record.risk_reward,
            explanation=record.explanation,
            reference_ids=dict(record.reference_ids or {}),
            detected_at=record.detected_at,
            expires_index=getattr(record, "expires_index", 0),
            status=record.status,
        )


@dataclass
class SetupEvaluation:
    accepted: bool
    strategy_confidence: float
    reasoning: str
    evidence_used: dict[str, float] = field(default_factory=dict)


@dataclass
class TradePlan:
    plan_id: str
    strategy_id: str
    strategy_version: str
    setup_id: str
    direction: str
    entry_zone_high: float
    entry_zone_low: float
    stop_loss: float
    target_1: float
    target_2: float
    target_3: float | None
    risk_reward: float
    trade_expiration_bars: int
    position_risk_pct: float
    strategy_confidence: float
    reasoning: str
    detected_at: datetime
    params_hash: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "strategy_id": self.strategy_id,
            "strategy_version": self.strategy_version,
            "setup_id": self.setup_id,
            "direction": self.direction,
            "entry_zone": {
                "high": round(self.entry_zone_high, 8),
                "low": round(self.entry_zone_low, 8),
            },
            "stop_loss": round(self.stop_loss, 8),
            "target_1": round(self.target_1, 8),
            "target_2": round(self.target_2, 8),
            "target_3": round(self.target_3, 8) if self.target_3 is not None else None,
            "risk_reward": round(self.risk_reward, 4),
            "trade_expiration_bars": self.trade_expiration_bars,
            "position_risk_pct": round(self.position_risk_pct, 4),
            "strategy_confidence": round(self.strategy_confidence, 2),
            "reasoning": self.reasoning,
            "detected_at": self.detected_at.isoformat(),
            "params_hash": self.params_hash,
        }


def new_plan_id() -> str:
    return uuid4().hex[:16]
