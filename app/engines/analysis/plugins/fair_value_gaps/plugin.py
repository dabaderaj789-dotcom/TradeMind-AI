"""Fair Value Gap analysis plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.plugins.fair_value_gaps.analyzer import FairValueGapAnalyzer
from app.engines.analysis.plugins.market_structure.analyzer import deduplicate_candles
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar

PLUGIN_ID = "fair_value_gaps"


class FairValueGapParameters(BaseModel):
    timeframe_code: str = Field(default="1h", description="Originating timeframe metadata")
    gap_mode: str = Field(
        default="wick",
        pattern="^(wick|body)$",
        description="Three-candle gap bounds: wick-to-wick or body-to-body",
    )
    min_gap_atr_ratio: float = Field(default=0.05, ge=0.0, le=5.0)
    min_gap_percent: float = Field(default=0.01, ge=0.0, le=10.0)
    invalidation_mode: str = Field(
        default="close",
        pattern="^(close|wick)$",
        description="Invalidate on close or wick through gap boundary",
    )
    expiration_bars: int = Field(
        default=0,
        ge=0,
        le=10_000,
        description="Bars until open FVG expires (0 = disabled)",
    )
    swing_sensitivity: int = Field(default=2, ge=1, le=10)
    atr_period: int = Field(default=14, ge=2, le=100)
    ob_proximity_atr: float = Field(default=3.0, ge=0.5, le=20.0)
    max_active_fvgs: int = Field(default=100, ge=10, le=500)
    include_order_blocks: bool = Field(default=True)
    quality_weight_gap_atr: float = Field(default=0.20, ge=0.0, le=1.0)
    quality_weight_impulse: float = Field(default=0.20, ge=0.0, le=1.0)
    quality_weight_volume: float = Field(default=0.15, ge=0.0, le=1.0)
    quality_weight_structure: float = Field(default=0.20, ge=0.0, le=1.0)
    quality_weight_ob: float = Field(default=0.10, ge=0.0, le=1.0)
    quality_weight_trend: float = Field(default=0.15, ge=0.0, le=1.0)


class FairValueGapPlugin(BaseAnalysisPlugin):
    """Detects institutional fair value gaps with fill lifecycle and context."""

    dependencies = ["market_structure", "order_blocks"]

    @classmethod
    def plugin_id(cls) -> str:
        return PLUGIN_ID

    @classmethod
    def plugin_name(cls) -> str:
        return "Fair Value Gaps"

    @classmethod
    def plugin_version(cls) -> str:
        return "1.0.0"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.SMART_MONEY

    @classmethod
    def required_history(cls) -> int:
        return 30

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return FairValueGapParameters().model_dump()

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return FairValueGapParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {
            "timeframe_code": {"type": "string"},
            "active_fvgs": {"type": "array"},
            "new_fvgs": {"type": "array"},
            "filled_fvgs": {"type": "array"},
            "invalidated_fvgs": {"type": "array"},
            "active_count": {"type": "integer"},
            "confidence": {"type": "number"},
        }

    @classmethod
    def description(cls) -> str:
        return (
            "Three-candle fair value gaps with quality scoring, fill tracking, "
            "invalidation, and Market Structure / Order Block context"
        )

    def calculate(
        self,
        candles: list[CandleBar],
        parameters: dict[str, Any],
    ) -> list[AnalysisBarResult]:
        deduped = deduplicate_candles(candles)
        weights = {
            "gap_size_atr": parameters["quality_weight_gap_atr"],
            "impulse_strength": parameters["quality_weight_impulse"],
            "volume_expansion": parameters["quality_weight_volume"],
            "structure_alignment": parameters["quality_weight_structure"],
            "order_block_proximity": parameters["quality_weight_ob"],
            "trend_alignment": parameters["quality_weight_trend"],
        }
        analyzer = FairValueGapAnalyzer(
            timeframe_code=parameters["timeframe_code"],
            gap_mode=parameters["gap_mode"],
            min_gap_atr_ratio=parameters["min_gap_atr_ratio"],
            min_gap_percent=parameters["min_gap_percent"],
            invalidation_mode=parameters["invalidation_mode"],
            expiration_bars=parameters["expiration_bars"],
            swing_sensitivity=parameters["swing_sensitivity"],
            atr_period=parameters["atr_period"],
            ob_proximity_atr=parameters["ob_proximity_atr"],
            max_active_fvgs=parameters["max_active_fvgs"],
            quality_weights=weights,
            include_order_blocks=parameters["include_order_blocks"],
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
        "active_fvgs": [],
        "new_fvgs": [],
        "filled_fvgs": [],
        "invalidated_fvgs": [],
        "active_count": 0,
        "confidence": 0.0,
    }
