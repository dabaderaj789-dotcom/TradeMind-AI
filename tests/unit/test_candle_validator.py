"""Tests for candle validation."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.domain.entities.candle import Candle
from app.pipeline.validator import CandleValidator


def _candle(**kwargs) -> Candle:
    defaults = {
        "symbol_code": "BTCUSDT",
        "timeframe_code": "1h",
        "open_time": datetime(2024, 1, 1, 0, 0, tzinfo=UTC),
        "close_time": datetime(2024, 1, 1, 1, 0, tzinfo=UTC),
        "open": Decimal("100"),
        "high": Decimal("110"),
        "low": Decimal("90"),
        "close": Decimal("105"),
        "volume": Decimal("1000"),
    }
    defaults.update(kwargs)
    return Candle(**defaults)


def test_valid_candle_passes() -> None:
    validator = CandleValidator()
    result = validator.validate_batch([_candle()])
    assert len(result.valid_candles) == 1
    assert result.rejected_count == 0


def test_rejects_non_positive_price() -> None:
    validator = CandleValidator()
    result = validator.validate_batch([_candle(open=Decimal("0"))])
    assert len(result.valid_candles) == 0
    assert result.rejected_count == 1


def test_rejects_ohlc_integrity_violation() -> None:
    validator = CandleValidator()
    result = validator.validate_batch([_candle(low=Decimal("120"))])
    assert result.rejected_count == 1


def test_rejects_negative_volume() -> None:
    validator = CandleValidator()
    result = validator.validate_batch([_candle(volume=Decimal("-1"))])
    assert result.rejected_count == 1


def test_rejects_non_monotonic_timestamps() -> None:
    validator = CandleValidator()
    c1 = _candle(open_time=datetime(2024, 1, 1, 1, 0, tzinfo=UTC))
    c2 = _candle(open_time=datetime(2024, 1, 1, 0, 0, tzinfo=UTC))
    result = validator.validate_batch([c1, c2])
    assert result.rejected_count == 1
    assert len(result.valid_candles) == 1


def test_rejects_extreme_price_change() -> None:
    validator = CandleValidator(max_price_change_pct=Decimal("10"))
    c1 = _candle(close=Decimal("100"))
    c2 = _candle(
        open_time=datetime(2024, 1, 1, 1, 0, tzinfo=UTC),
        close_time=datetime(2024, 1, 1, 2, 0, tzinfo=UTC),
        close=Decimal("200"),
    )
    result = validator.validate_batch([c1, c2])
    assert result.rejected_count == 1
