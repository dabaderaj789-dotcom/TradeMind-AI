"""VWAP (Volume Weighted Average Price) plugin."""

from typing import Any

from pydantic import BaseModel

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class VWAPParameters(BaseModel):
    pass


class VWAPPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "vwap"

    @classmethod
    def plugin_name(cls) -> str:
        return "Volume Weighted Average Price"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.VOLUME

    @classmethod
    def required_history(cls) -> int:
        return 1

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return VWAPParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {"vwap": {"type": "number", "description": "Cumulative VWAP"}}

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        cumulative_tp_vol = 0.0
        cumulative_vol = 0.0
        results: list[AnalysisBarResult] = []

        for candle in candles:
            typical_price = (candle.high + candle.low + candle.close) / 3.0
            cumulative_tp_vol += typical_price * candle.volume
            cumulative_vol += candle.volume
            vwap = cumulative_tp_vol / cumulative_vol if cumulative_vol > 0 else None
            results.append(
                AnalysisBarResult(open_time=candle.open_time, values={"vwap": vwap})
            )
        return results
