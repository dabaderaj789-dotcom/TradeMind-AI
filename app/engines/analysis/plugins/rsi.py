"""RSI (Relative Strength Index) plugin."""

from typing import Any

from pydantic import BaseModel, Field

from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar


class RSIParameters(BaseModel):
    period: int = Field(default=14, ge=2, le=500)


class RSIPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "rsi"

    @classmethod
    def plugin_name(cls) -> str:
        return "Relative Strength Index"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.MOMENTUM

    @classmethod
    def required_history(cls) -> int:
        return 15

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {"period": 14}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        return RSIParameters

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {"rsi": {"type": "number", "description": "RSI 0-100"}}

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        period = parameters["period"]
        closes = [c.close for c in candles]
        rsi_values = _compute_rsi(closes, period)
        return [
            AnalysisBarResult(open_time=candles[i].open_time, values={"rsi": rsi_values[i]})
            for i in range(len(candles))
        ]


def _compute_rsi(closes: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return out

    gains: list[float] = []
    losses: list[float] = []
    for i in range(1, len(closes)):
        change = closes[i] - closes[i - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    def _rsi(ag: float, al: float) -> float:
        if al == 0:
            return 100.0
        rs = ag / al
        return 100.0 - (100.0 / (1.0 + rs))

    out[period] = _rsi(avg_gain, avg_loss)

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        out[i + 1] = _rsi(avg_gain, avg_loss)

    return out
