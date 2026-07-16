"""SMA (Simple Moving Average) plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.math_utils import sma
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class SMAParameters(BaseModel):
    period: int = Field(default=20, ge=2, le=500)


class SMAPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "sma"

    @classmethod
    def plugin_name(cls) -> str:
        return "Simple Moving Average"

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
        return SMAParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {"sma": {"type": "number", "description": "SMA value"}}

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        period = parameters["period"]
        closes = [c.close for c in candles]
        values = sma(closes, period)
        return [
            AnalysisBarResult(open_time=candles[i].open_time, values={"sma": values[i]})
            for i in range(len(candles))
        ]
