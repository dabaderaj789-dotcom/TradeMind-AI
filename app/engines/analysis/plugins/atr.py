"""ATR (Average True Range) plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.math_utils import sma, true_range
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class ATRParameters(BaseModel):
    period: int = Field(default=14, ge=2, le=500)


class ATRPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "atr"

    @classmethod
    def plugin_name(cls) -> str:
        return "Average True Range"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.VOLATILITY

    @classmethod
    def required_history(cls) -> int:
        return 15

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {"period": 14}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return ATRParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {"atr": {"type": "number", "description": "ATR value"}}

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        period = parameters["period"]
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]
        closes = [c.close for c in candles]
        tr = true_range(highs, lows, closes)
        atr_values = sma(tr, period)
        return [
            AnalysisBarResult(open_time=candles[i].open_time, values={"atr": atr_values[i]})
            for i in range(len(candles))
        ]
