"""Datetime utilities."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC datetime with timezone info."""
    return datetime.now(UTC)
