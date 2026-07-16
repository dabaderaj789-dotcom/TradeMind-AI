"""MACD plugin."""

from __future__ import annotations

from typing import Any, Self

from pydantic import BaseModel, Field, model_validator

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.math_utils import ema
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class MACDParameters(BaseModel):
    fast_period: int = Field(default=12, ge=2, le=500)
    slow_period: int = Field(default=26, ge=2, le=500)
    signal_period: int = Field(default=9, ge=2, le=500)

    @model_validator(mode="after")
    def validate_periods(self) -> Self:
        if self.fast_period >= self.slow_period:
            raise ValueError("fast_period must be less than slow_period")
        return self


class MACDPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "macd"

    @classmethod
    def plugin_name(cls) -> str:
        return "MACD"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.MOMENTUM

    @classmethod
    def required_history(cls) -> int:
        return 35

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {"fast_period": 12, "slow_period": 26, "signal_period": 9}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return MACDParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {
            "macd": {"type": "number"},
            "signal": {"type": "number"},
            "histogram": {"type": "number"},
        }

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        fast = parameters["fast_period"]
        slow = parameters["slow_period"]
        signal_period = parameters["signal_period"]

        closes = [c.close for c in candles]
        fast_ema = ema(closes, fast)
        slow_ema = ema(closes, slow)

        macd_line: list[float | None] = [None] * len(closes)
        for i in range(len(closes)):
            if fast_ema[i] is not None and slow_ema[i] is not None:
                macd_line[i] = fast_ema[i] - slow_ema[i]

        macd_floats = [v if v is not None else 0.0 for v in macd_line]
        signal_line = ema(macd_floats, signal_period)

        results: list[AnalysisBarResult] = []
        for i, candle in enumerate(candles):
            macd_val = macd_line[i]
            signal_val = signal_line[i]
            histogram = None
            if macd_val is not None and signal_val is not None:
                histogram = macd_val - signal_val
            results.append(
                AnalysisBarResult(
                    open_time=candle.open_time,
                    values={"macd": macd_val, "signal": signal_val, "histogram": histogram},
                )
            )
        return results
