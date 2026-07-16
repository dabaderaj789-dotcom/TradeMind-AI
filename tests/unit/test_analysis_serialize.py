"""Tests for analysis value serialization."""

from app.engines.analysis.serialize import has_meaningful_values, serialize_analysis_values


def test_serialize_nested_structures() -> None:
    values = {
        "trend": "bullish",
        "bos": {"type": "bos_bullish", "break_price": 105.5},
        "support_levels": [{"price": 100.0, "strength": 0.8, "touches": 2}],
    }
    serialized = serialize_analysis_values(values)
    assert serialized["trend"] == "bullish"
    assert serialized["bos"]["type"] == "bos_bullish"
    assert has_meaningful_values(serialized)
