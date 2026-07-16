"""Market Structure analysis plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.plugins.market_structure.analyzer import (
    MarketStructureAnalyzer,
    deduplicate_candles,
)
from app.engines.analysis.plugins.market_structure.types import BarStructureState
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar

PLUGIN_ID = "market_structure"


class MarketStructureParameters(BaseModel):
    swing_sensitivity: int = Field(
        default=2,
        ge=1,
        le=10,
        description="Bars on each side for swing pivot confirmation",
    )
    atr_period: int = Field(default=14, ge=2, le=100)
    level_touch_tolerance_atr: float = Field(default=0.5, ge=0.1, le=2.0)
    max_active_levels: int = Field(default=5, ge=1, le=20)
    phase_lookback_swings: int = Field(default=6, ge=2, le=30)


class MarketStructurePlugin(BaseAnalysisPlugin):
    """Detects swings, trend, BOS, CHoCH, market phase, and dynamic S/R levels."""

    @classmethod
    def plugin_id(cls) -> str:
        return PLUGIN_ID

    @classmethod
    def plugin_name(cls) -> str:
        return "Market Structure"

    @classmethod
    def plugin_version(cls) -> str:
        return "1.0.0"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.MARKET_STRUCTURE

    @classmethod
    def required_history(cls) -> int:
        return 30

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return MarketStructureParameters().model_dump()

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return MarketStructureParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {
            "trend": {"type": "string", "enum": ["bullish", "bearish", "sideways"]},
            "swing_type": {"type": "string", "enum": ["HH", "HL", "LH", "LL", None]},
            "swing_strength": {"type": "number"},
            "is_swing_high": {"type": "boolean"},
            "is_swing_low": {"type": "boolean"},
            "bos": {"type": "object"},
            "choch": {"type": "object"},
            "market_phase": {
                "type": "string",
                "enum": ["trending", "ranging", "accumulation", "distribution"],
            },
            "phase_confidence": {"type": "number"},
            "confidence": {"type": "number"},
            "support_levels": {"type": "array"},
            "resistance_levels": {"type": "array"},
        }

    @classmethod
    def description(cls) -> str:
        return (
            "Swing structure, trend, BOS, CHoCH, market phase, and dynamic support/resistance"
        )

    def calculate(
        self,
        candles: list[CandleBar],
        parameters: dict[str, Any],
    ) -> list[AnalysisBarResult]:
        deduped = deduplicate_candles(candles)
        analyzer = MarketStructureAnalyzer(
            swing_sensitivity=parameters["swing_sensitivity"],
            atr_period=parameters["atr_period"],
            level_touch_tolerance_atr=parameters["level_touch_tolerance_atr"],
            max_active_levels=parameters["max_active_levels"],
            phase_lookback_swings=parameters["phase_lookback_swings"],
        )
        states = analyzer.analyze(deduped)
        state_by_time = {deduped[i].open_time: states[i] for i in range(len(deduped))}
        empty = BarStructureState().to_values()

        return [
            AnalysisBarResult(
                open_time=c.open_time,
                values=state_by_time[c.open_time].to_values()
                if c.open_time in state_by_time
                else empty,
            )
            for c in candles
        ]
