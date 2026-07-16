"""EMA (Exponential Moving Average) plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.math_utils import ema
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class EMAParameters(BaseModel):
    period: int = Field(default=20, ge=2, le=500)


class EMAPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "ema"

    @classmethod
    def plugin_name(cls) -> str:
        return "Exponential Moving Average"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.TREND

    @classmethod
    def required_history(cls) -> int:
        return 20

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {"period": 20}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return EMAParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {"ema": {"type": "number", "description": "EMA value"}}

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        period = parameters["period"]
        closes = [c.close for c in candles]
        values = ema(closes, period)
        return [
            AnalysisBarResult(open_time=candles[i].open_time, values={"ema": values[i]})
            for i in range(len(candles))
        ]
