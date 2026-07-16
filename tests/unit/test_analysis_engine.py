"""Tests for AnalysisEngine orchestration."""

import pytest

from app.engines.analysis.engine import AnalysisEngine
from app.engines.analysis.plugins.ema import EMAPlugin
from app.engines.analysis.plugins.rsi import RSIPlugin
from app.engines.analysis.registry import AnalysisPluginRegistry
from app.engines.analysis.types import AnalysisJob, PluginExecutionRequest
from app.engines.analysis.base import BaseAnalysisPlugin
from app.engines.analysis.types import AnalysisBarResult, AnalysisCategory, CandleBar
from tests.fixtures.candles import generate_trending_candles
from pydantic import BaseModel
from typing import Any


class FailingPlugin(BaseAnalysisPlugin):
    @classmethod
    def plugin_id(cls) -> str:
        return "failing_test"

    @classmethod
    def plugin_name(cls) -> str:
        return "Failing Test Plugin"

    @classmethod
    def category(cls) -> AnalysisCategory:
        return AnalysisCategory.TREND

    @classmethod
    def required_history(cls) -> int:
        return 1

    @classmethod
    def default_parameters(cls) -> dict[str, Any]:
        return {}

    @classmethod
    def parameters_model(cls) -> type[BaseModel]:
        class Empty(BaseModel):
            pass
        return Empty

    @classmethod
    def output_schema(cls) -> dict[str, Any]:
        return {}

    def calculate(self, candles: list[CandleBar], parameters: dict[str, Any]) -> list[AnalysisBarResult]:
        raise RuntimeError("intentional failure")


@pytest.fixture
def registry() -> AnalysisPluginRegistry:
    reg = AnalysisPluginRegistry()
    reg.register(EMAPlugin())
    reg.register(RSIPlugin())
    reg.register(FailingPlugin())
    return reg


@pytest.fixture
def engine(registry: AnalysisPluginRegistry) -> AnalysisEngine:
    return AnalysisEngine(registry=registry)


@pytest.mark.asyncio
async def test_plugin_discovery(registry: AnalysisPluginRegistry) -> None:
    ids = registry.plugin_ids()
    assert "ema" in ids
    assert "rsi" in ids


@pytest.mark.asyncio
async def test_engine_runs_multiple_plugins(engine: AnalysisEngine) -> None:
    candles = generate_trending_candles(100)
    job = AnalysisJob(
        symbol_id="test-symbol",
        timeframe_id=4,
        timeframe_code="1h",
        candles=candles,
        plugins=[
            PluginExecutionRequest(plugin_id="ema", parameters={"period": 20}),
            PluginExecutionRequest(plugin_id="rsi", parameters={"period": 14}),
        ],
    )
    result = await engine.run_job(job)
    assert len(result.plugin_results) == 2
    assert all(r.success for r in result.plugin_results)
    assert result.plugin_results[0].results[-1].values.get("ema") is not None


@pytest.mark.asyncio
async def test_failure_isolation(engine: AnalysisEngine) -> None:
    candles = generate_trending_candles(50)
    job = AnalysisJob(
        symbol_id="test-symbol",
        timeframe_id=4,
        timeframe_code="1h",
        candles=candles,
        plugins=[
            PluginExecutionRequest(plugin_id="ema", parameters={"period": 20}),
            PluginExecutionRequest(plugin_id="failing_test", parameters={}),
            PluginExecutionRequest(plugin_id="rsi", parameters={"period": 14}),
        ],
    )
    result = await engine.run_job(job)
    assert len(result.plugin_results) == 3
    successes = [r for r in result.plugin_results if r.success]
    failures = [r for r in result.plugin_results if not r.success]
    assert len(successes) == 2
    assert len(failures) == 1
    assert failures[0].plugin_id == "failing_test"


@pytest.mark.asyncio
async def test_insufficient_history_still_runs(engine: AnalysisEngine) -> None:
    candles = generate_trending_candles(5)
    job = AnalysisJob(
        symbol_id="test-symbol",
        timeframe_id=4,
        timeframe_code="1h",
        candles=candles,
        plugins=[PluginExecutionRequest(plugin_id="rsi", parameters={"period": 14})],
    )
    result = await engine.run_job(job)
    assert result.plugin_results[0].success
    assert result.plugin_results[0].results[-1].values["rsi"] is None
