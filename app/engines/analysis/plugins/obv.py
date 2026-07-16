"""OBV (On Balance Volume) plugin."""

from typing import Any

from pydantic import BaseModel

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class OBVParameters(BaseModel):
    pass


class OBVPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "obv"

    @classmethod
    def plugin_name(cls) -> str:
        return "On Balance Volume"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.VOLUME

    @classmethod
    def required_history(cls) -> int:
        return 2

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return OBVParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {"obv": {"type": "number", "description": "Cumulative OBV"}}

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        obv = 0.0
        results: list[AnalysisBarResult] = []

        for i, candle in enumerate(candles):
            if i == 0:
                obv = candle.volume
            else:
                prev_close = candles[i - 1].close
                if candle.close > prev_close:
                    obv += candle.volume
                elif candle.close < prev_close:
                    obv -= candle.volume
            results.append(
                AnalysisBarResult(open_time=candle.open_time, values={"obv": obv})
            )
        return results
