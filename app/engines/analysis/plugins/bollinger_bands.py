"""Bollinger Bands plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.math_utils import sma
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class BollingerParameters(BaseModel):
    period: int = Field(default=20, ge=2, le=500)
    std_dev: float = Field(default=2.0, ge=0.1, le=5.0)


class BollingerBandsPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "bollinger_bands"

    @classmethod
    def plugin_name(cls) -> str:
        return "Bollinger Bands"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.VOLATILITY

    @classmethod
    def required_history(cls) -> int:
        return 20

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {"period": 20, "std_dev": 2.0}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return BollingerParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {
            "upper": {"type": "number"},
            "middle": {"type": "number"},
            "lower": {"type": "number"},
        }

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        period = parameters["period"]
        std_dev = parameters["std_dev"]
        closes = [c.close for c in candles]
        middle = sma(closes, period)

        results: list[AnalysisBarResult] = []
        for i, candle in enumerate(candles):
            upper = lower = None
            mid = middle[i]
            if mid is not None and i >= period - 1:
                window = closes[i - period + 1 : i + 1]
                mean = sum(window) / period
                variance = sum((x - mean) ** 2 for x in window) / period
                std = variance**0.5
                upper = mid + std_dev * std
                lower = mid - std_dev * std
            results.append(
                AnalysisBarResult(
                    open_time=candle.open_time,
                    values={"upper": upper, "middle": mid, "lower": lower},
                )
            )
        return results
