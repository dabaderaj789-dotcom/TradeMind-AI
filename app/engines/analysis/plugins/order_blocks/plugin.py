"""Order Block analysis plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.plugins.market_structure.analyzer import deduplicate_candles
from app.engines.analysis.plugins.order_blocks.analyzer import OrderBlockAnalyzer
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar

PLUGIN_ID = "order_blocks"


class OrderBlockParameters(BaseModel):
    timeframe_code: str = Field(default="1h", description="Originating timeframe metadata")
    zone_mode: str = Field(
        default="body",
        pattern="^(body|wick)$",
        description="Zone bounds: body (open) or full wick",
    )
    invalidation_mode: str = Field(
        default="close",
        pattern="^(close|wick)$",
        description="Invalidate on candle close or wick beyond zone",
    )
    cluster_max_bars: int = Field(default=3, ge=1, le=10)
    lookback_before_bos: int = Field(default=20, ge=3, le=100)
    swing_sensitivity: int = Field(
        default=2,
        ge=1,
        le=10,
        description="Market Structure swing sensitivity for BOS detection",
    )
    atr_period: int = Field(default=14, ge=2, le=100)
    max_active_blocks: int = Field(default=50, ge=5, le=200)
    strength_weight_bos: float = Field(default=0.25, ge=0.0, le=1.0)
    strength_weight_volume: float = Field(default=0.20, ge=0.0, le=1.0)
    strength_weight_atr: float = Field(default=0.15, ge=0.0, le=1.0)
    strength_weight_impulse: float = Field(default=0.20, ge=0.0, le=1.0)
    strength_weight_age: float = Field(default=0.10, ge=0.0, le=1.0)
    strength_weight_reactions: float = Field(default=0.10, ge=0.0, le=1.0)


class OrderBlockPlugin(BaseAnalysisPlugin):
    """Detects institutional order blocks from confirmed Market Structure BOS events."""

    dependencies = ["market_structure"]

    @classmethod
    def plugin_id(cls) -> str:
        return PLUGIN_ID

    @classmethod
    def plugin_name(cls) -> str:
        return "Order Blocks"

    @classmethod
    def plugin_version(cls) -> str:
        return "1.0.0"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.SMART_MONEY

    @classmethod
    def required_history(cls) -> int:
        return 40

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return OrderBlockParameters().model_dump()

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return OrderBlockParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {
            "timeframe_code": {"type": "string"},
            "active_order_blocks": {"type": "array"},
            "new_order_blocks": {"type": "array"},
            "mitigated_order_blocks": {"type": "array"},
            "invalidated_order_blocks": {"type": "array"},
            "active_count": {"type": "integer"},
            "confidence": {"type": "number"},
        }

    @classmethod
    def description(cls) -> str:
        return (
            "Institutional order blocks from bearish/bullish clusters before "
            "confirmed Market Structure BOS with mitigation and invalidation tracking"
        )

    def calculate(
        self,
        candles: list[CandleBar],
        parameters: dict[str, Any],
    ) -> list[AnalysisBarResult]:
        deduped = deduplicate_candles(candles)
        weights = {
            "bos_strength": parameters["strength_weight_bos"],
            "volume_ratio": parameters["strength_weight_volume"],
            "atr_expansion": parameters["strength_weight_atr"],
            "impulse_move": parameters["strength_weight_impulse"],
            "age_factor": parameters["strength_weight_age"],
            "reaction_count": parameters["strength_weight_reactions"],
        }
        analyzer = OrderBlockAnalyzer(
            timeframe_code=parameters["timeframe_code"],
            zone_mode=parameters["zone_mode"],
            invalidation_mode=parameters["invalidation_mode"],
            cluster_max_bars=parameters["cluster_max_bars"],
            lookback_before_bos=parameters["lookback_before_bos"],
            swing_sensitivity=parameters["swing_sensitivity"],
            atr_period=parameters["atr_period"],
            strength_weights=weights,
            max_active_blocks=parameters["max_active_blocks"],
        )
        states = analyzer.analyze(deduped)
        state_by_time = {deduped[i].open_time: states[i] for i in range(len(deduped))}
        tf = parameters["timeframe_code"]
        empty = _empty_values(tf)

        return [
            AnalysisBarResult(
                open_time=c.open_time,
                values=state_by_time[c.open_time].to_values(tf)
                if c.open_time in state_by_time
                else empty,
            )
            for c in candles
        ]


def _empty_values(timeframe_code: str) -> dict[str, Any]:
    return {
        "timeframe_code": timeframe_code,
        "active_order_blocks": [],
        "new_order_blocks": [],
        "mitigated_order_blocks": [],
        "invalidated_order_blocks": [],
        "active_count": 0,
        "confidence": 0.0,
    }
