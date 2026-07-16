"""Serialize analysis bar values for JSONB storage."""

from __future__ import annotations

from datetime import datetime
from typing import Any


def serialize_analysis_values(values: dict[str, Any]) -> dict[str, Any]:
    """Convert analysis output values to JSON-serializable primitives."""

    def convert(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            return value
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, dict):
            return {str(k): convert(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [convert(item) for item in value]
        return str(value)

    return {str(k): convert(v) for k, v in values.items()}


def has_meaningful_values(values: dict[str, Any]) -> bool:
    """Return True if the bar carries any non-null analysis output."""
    if not values:
        return False
    for v in values.values():
        if v is None:
            continue
        if isinstance(v, (list, dict)) and len(v) == 0:
            continue
        if isinstance(v, bool) and v is False:
            continue
        return True
    return False
