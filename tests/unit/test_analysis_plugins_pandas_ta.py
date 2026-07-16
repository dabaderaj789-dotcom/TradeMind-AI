"""Compare analysis plugins against pandas-ta reference implementations."""

from __future__ import annotations

import pytest

from app.engines.analysis.plugins.atr import ATRPlugin
from app.engines.analysis.plugins.bollinger_bands import BollingerBandsPlugin
from app.engines.analysis.plugins.ema import EMAPlugin
from app.engines.analysis.plugins.macd import MACDPlugin
from app.engines.analysis.plugins.obv import OBVPlugin
from app.engines.analysis.plugins.rsi import RSIPlugin
from app.engines.analysis.plugins.sma import SMAPlugin
from app.engines.analysis.plugins.vwap import VWAPPlugin
from tests.fixtures.candles import generate_trending_candles

pandas_ta = pytest.importorskip("pandas_ta")
import pandas as pd

TOLERANCE = 1e-4


@pytest.fixture
def candles():
    return generate_trending_candles(200)


@pytest.fixture
def df(candles):
    return pd.DataFrame(
        {
            "open": [c.open for c in candles],
            "high": [c.high for c in candles],
            "low": [c.low for c in candles],
            "close": [c.close for c in candles],
            "volume": [c.volume for c in candles],
        }
    )


def _last_valid(series) -> float:
    valid = series.dropna()
    return float(valid.iloc[-1])


@pytest.mark.parametrize(
    "plugin_cls,params,ta_func,col,key",
    [
        (SMAPlugin, {"period": 20}, lambda d: d.ta.sma(length=20), "SMA_20", "sma"),
        (EMAPlugin, {"period": 20}, lambda d: d.ta.ema(length=20), "EMA_20", "ema"),
        (RSIPlugin, {"period": 14}, lambda d: d.ta.rsi(length=14), "RSI_14", "rsi"),
    ],
)
def test_trend_momentum_vs_pandas_ta(plugin_cls, params, ta_func, col, key, candles, df) -> None:
    plugin = plugin_cls()
    results = plugin.calculate(candles, plugin.validate_parameters(params))
    ref = ta_func(df)
    ref_col = col if col in ref.columns else ref.columns[0]
    expected = _last_valid(ref[ref_col])
    actual = results[-1].values[key]
    assert actual is not None
    assert actual == pytest.approx(expected, rel=TOLERANCE, abs=0.05)


def test_macd_vs_pandas_ta(candles, df) -> None:
    plugin = MACDPlugin()
    params = plugin.validate_parameters({})
    results = plugin.calculate(candles, params)
    ref = df.ta.macd(fast=12, slow=26, signal=9)
    for key, col_suffix in [("macd", "MACD_12_26_9"), ("signal", "MACDs_12_26_9"), ("histogram", "MACDh_12_26_9")]:
        col = [c for c in ref.columns if col_suffix in c][0]
        expected = _last_valid(ref[col])
        actual = results[-1].values[key]
        assert actual is not None
        assert actual == pytest.approx(expected, rel=TOLERANCE, abs=0.1)


def test_atr_vs_pandas_ta(candles, df) -> None:
    plugin = ATRPlugin()
    params = plugin.validate_parameters({"period": 14})
    results = plugin.calculate(candles, params)
    ref = df.ta.atr(length=14)
    expected = _last_valid(ref[ref.columns[0]])
    actual = results[-1].values["atr"]
    assert actual is not None
    assert actual == pytest.approx(expected, rel=TOLERANCE, abs=0.1)


def test_bollinger_vs_pandas_ta(candles, df) -> None:
    plugin = BollingerBandsPlugin()
    params = plugin.validate_parameters({"period": 20, "std_dev": 2.0})
    results = plugin.calculate(candles, params)
    ref = df.ta.bbands(length=20, std=2)
    mapping = {
        "lower": [c for c in ref.columns if "BBL" in c][0],
        "middle": [c for c in ref.columns if "BBM" in c][0],
        "upper": [c for c in ref.columns if "BBU" in c][0],
    }
    for key, col in mapping.items():
        expected = _last_valid(ref[col])
        actual = results[-1].values[key]
        assert actual is not None
        assert actual == pytest.approx(expected, rel=TOLERANCE, abs=0.1)


def test_obv_vs_pandas_ta(candles, df) -> None:
    plugin = OBVPlugin()
    results = plugin.calculate(candles, plugin.validate_parameters({}))
    ref = df.ta.obv()
    expected = _last_valid(ref[ref.columns[0]])
    actual = results[-1].values["obv"]
    assert actual == pytest.approx(expected, rel=TOLERANCE, abs=1.0)


def test_vwap_cumulative(candles) -> None:
    plugin = VWAPPlugin()
    results = plugin.calculate(candles, plugin.validate_parameters({}))
    assert results[-1].values["vwap"] is not None
    assert len(results) == len(candles)


def test_invalid_parameters_rejected() -> None:
    plugin = RSIPlugin()
    with pytest.raises(Exception):
        plugin.validate_parameters({"period": 1})


def test_empty_candles() -> None:
    plugin = EMAPlugin()
    results = plugin.calculate([], plugin.validate_parameters({}))
    assert results == []
