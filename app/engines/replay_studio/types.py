"""Replay Studio domain types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4


REPLAY_STUDIO_VERSION = "1.0.0"

INDICATOR_PLUGINS = ("ema", "sma", "rsi", "macd", "atr", "vwap", "bollinger_bands", "obv")
SMC_PLUGINS = ("market_structure", "order_blocks", "fair_value_gaps", "liquidity_sweeps")
ALL_REPLAY_PLUGINS = INDICATOR_PLUGINS + SMC_PLUGINS

PLUGIN_EXECUTION_ORDER = (
    "market_structure",
    "order_blocks",
    "fair_value_gaps",
    "liquidity_sweeps",
    "ema",
    "sma",
    "rsi",
    "macd",
    "atr",
    "vwap",
    "bollinger_bands",
    "obv",
)


class ReplayEventType(StrEnum):
    BOS = "bos"
    CHOCH = "choch"
    SWING_HIGH = "swing_high"
    SWING_LOW = "swing_low"
    ORDER_BLOCK = "order_block"
    FVG = "fvg"
    LIQUIDITY_SWEEP = "liquidity_sweep"
    TRADE_SETUP = "trade_setup"
    STRATEGY_DECISION = "strategy_decision"


class ReplayPlaybackState(StrEnum):
    PAUSED = "paused"
    PLAYING = "playing"


@dataclass
class ReplayCandle:
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "time": int(self.open_time.timestamp()),
            "open_time": self.open_time.isoformat(),
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


@dataclass
class ReplayEvent:
    event_id: str
    event_type: str
    bar_index: int
    open_time: datetime
    label: str
    direction: str | None = None
    price: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "bar_index": self.bar_index,
            "open_time": self.open_time.isoformat(),
            "label": self.label,
            "direction": self.direction,
            "price": self.price,
            "metadata": self.metadata,
        }


@dataclass
class LoadTiming:
    plugin_id: str
    duration_ms: float
    rows_loaded: int
    cache_hit: bool = False


@dataclass
class SessionMetrics:
    candles_loaded: int = 0
    plugins_loaded: int = 0
    events_extracted: int = 0
    load_timings: list[LoadTiming] = field(default_factory=list)
    total_load_ms: float = 0.0
    db_query_ms: float = 0.0
    memory_estimate_bytes: int = 0
    cache_hits: int = 0
    cache_misses: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "candles_loaded": self.candles_loaded,
            "plugins_loaded": self.plugins_loaded,
            "events_extracted": self.events_extracted,
            "total_load_ms": round(self.total_load_ms, 2),
            "db_query_ms": round(self.db_query_ms, 2),
            "memory_estimate_bytes": self.memory_estimate_bytes,
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "plugin_timings": [
                {
                    "plugin_id": t.plugin_id,
                    "duration_ms": round(t.duration_ms, 2),
                    "rows_loaded": t.rows_loaded,
                    "cache_hit": t.cache_hit,
                }
                for t in self.load_timings
            ],
        }


@dataclass
class TradeSetupSnapshot:
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
    bar_index: int
    status: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "setup_id": self.setup_id,
            "setup_type": self.setup_type,
            "direction": self.direction,
            "confidence_score": self.confidence_score,
            "confidence_level": self.confidence_level,
            "evidence_scores": self.evidence_scores,
            "entry_zone": self.entry_zone,
            "stop_loss_zone": self.stop_loss_zone,
            "target_zones": self.target_zones,
            "risk_reward": self.risk_reward,
            "explanation": self.explanation,
            "reference_ids": self.reference_ids,
            "detected_at": self.detected_at.isoformat(),
            "bar_index": self.bar_index,
            "status": self.status,
        }


@dataclass
class StrategyDecisionSnapshot:
    plan_id: str
    strategy_id: str
    setup_id: str
    direction: str
    entry_zone: dict[str, float]
    stop_loss: float
    target_1: float
    target_2: float
    target_3: float | None
    risk_reward: float
    strategy_confidence: float
    reasoning: str
    detected_at: datetime
    bar_index: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "strategy_id": self.strategy_id,
            "setup_id": self.setup_id,
            "direction": self.direction,
            "entry_zone": self.entry_zone,
            "stop_loss": self.stop_loss,
            "target_1": self.target_1,
            "target_2": self.target_2,
            "target_3": self.target_3,
            "risk_reward": self.risk_reward,
            "strategy_confidence": self.strategy_confidence,
            "reasoning": self.reasoning,
            "detected_at": self.detected_at.isoformat(),
            "bar_index": self.bar_index,
        }


@dataclass
class ReplaySession:
    session_id: UUID
    symbol_id: UUID
    symbol_code: str
    timeframe_id: int
    timeframe_code: str
    candles: list[ReplayCandle]
    analysis_by_plugin: dict[str, dict[datetime, dict[str, Any]]]
    params_hashes: dict[str, str]
    trade_setups: list[TradeSetupSnapshot]
    strategy_decisions: list[StrategyDecisionSnapshot]
    events: list[ReplayEvent]
    time_to_index: dict[datetime, int]
    current_index: int = 0
    playback_state: str = ReplayPlaybackState.PAUSED.value
    replay_speed: float = 1.0
    debug_mode: bool = False
    validation_mode: bool = False
    metrics: SessionMetrics = field(default_factory=SessionMetrics)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @property
    def total_bars(self) -> int:
        return len(self.candles)

    def current_candle(self) -> ReplayCandle | None:
        if not self.candles or self.current_index < 0:
            return None
        return self.candles[min(self.current_index, len(self.candles) - 1)]


def new_event_id() -> str:
    return uuid4().hex[:12]
