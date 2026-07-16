"""Liquidity Sweep analysis plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.plugins.liquidity_sweeps.analyzer import LiquiditySweepAnalyzer
from app.engines.analysis.plugins.market_structure.analyzer import deduplicate_candles
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar

PLUGIN_ID = "liquidity_sweeps"


class LiquiditySweepParameters(BaseModel):
    timeframe_code: str = Field(default="1h", description="Originating timeframe metadata")
    sweep_mode: str = Field(
        default="wick",
        pattern="^(wick|close)$",
        description="Wick rejection or close-confirmed sweep",
    )
    min_penetration_atr: float = Field(default=0.05, ge=0.0, le=2.0)
    max_lookback: int = Field(default=100, ge=10, le=500)
    equal_level_tolerance_atr: float = Field(default=0.15, ge=0.01, le=1.0)
    confirmation_bars: int = Field(default=3, ge=1, le=20)
    confirmation_threshold: float = Field(default=50.0, ge=0.0, le=100.0)
    swing_sensitivity: int = Field(default=2, ge=1, le=10)
    atr_period: int = Field(default=14, ge=2, le=100)
    sm_proximity_atr: float = Field(default=3.0, ge=0.5, le=20.0)
    max_active_sweeps: int = Field(default=100, ge=10, le=500)
    include_order_blocks: bool = Field(default=True)
    include_fvgs: bool = Field(default=True)
    session_levels: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Future-compatible session high/low levels",
    )
    strength_weight_penetration: float = Field(default=0.20, ge=0.0, le=1.0)
    strength_weight_rejection: float = Field(default=0.25, ge=0.0, le=1.0)
    strength_weight_volume: float = Field(default=0.15, ge=0.0, le=1.0)
    strength_weight_atr: float = Field(default=0.10, ge=0.0, le=1.0)
    strength_weight_structure: float = Field(default=0.15, ge=0.0, le=1.0)
    strength_weight_smart_money: float = Field(default=0.15, ge=0.0, le=1.0)


class LiquiditySweepPlugin(BaseAnalysisPlugin):
    """Detects buy-side and sell-side liquidity sweeps with confirmation scoring."""

    dependencies = ["market_structure", "order_blocks", "fair_value_gaps"]

    @classmethod
    def plugin_id(cls) -> str:
        return PLUGIN_ID

    @classmethod
    def plugin_name(cls) -> str:
        return "Liquidity Sweeps"

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
        return LiquiditySweepParameters().model_dump()

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return LiquiditySweepParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {
            "timeframe_code": {"type": "string"},
            "active_sweeps": {"type": "array"},
            "new_sweeps": {"type": "array"},
            "confirmed_sweeps": {"type": "array"},
            "failed_sweeps": {"type": "array"},
            "invalidated_sweeps": {"type": "array"},
            "active_count": {"type": "integer"},
            "confidence": {"type": "number"},
        }

    @classmethod
    def description(cls) -> str:
        return (
            "Buy-side and sell-side liquidity sweeps above/below swing and equal levels "
            "with confirmation, strength scoring, and SMC context"
        )

    def calculate(
        self,
        candles: list[CandleBar],
        parameters: dict[str, Any],
    ) -> list[AnalysisBarResult]:
        deduped = deduplicate_candles(candles)
        weights = {
            "penetration_depth": parameters["strength_weight_penetration"],
            "rejection_strength": parameters["strength_weight_rejection"],
            "volume": parameters["strength_weight_volume"],
            "atr": parameters["strength_weight_atr"],
            "market_structure_context": parameters["strength_weight_structure"],
            "smart_money_context": parameters["strength_weight_smart_money"],
        }
        analyzer = LiquiditySweepAnalyzer(
            timeframe_code=parameters["timeframe_code"],
            sweep_mode=parameters["sweep_mode"],
            min_penetration_atr=parameters["min_penetration_atr"],
            max_lookback=parameters["max_lookback"],
            equal_level_tolerance_atr=parameters["equal_level_tolerance_atr"],
            confirmation_bars=parameters["confirmation_bars"],
            confirmation_threshold=parameters["confirmation_threshold"],
            swing_sensitivity=parameters["swing_sensitivity"],
            atr_period=parameters["atr_period"],
            sm_proximity_atr=parameters["sm_proximity_atr"],
            max_active_sweeps=parameters["max_active_sweeps"],
            strength_weights=weights,
            include_order_blocks=parameters["include_order_blocks"],
            include_fvgs=parameters["include_fvgs"],
            session_levels=parameters.get("session_levels") or [],
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
        "active_sweeps": [],
        "new_sweeps": [],
        "confirmed_sweeps": [],
        "failed_sweeps": [],
        "invalidated_sweeps": [],
        "active_count": 0,
        "confidence": 0.0,
    }
