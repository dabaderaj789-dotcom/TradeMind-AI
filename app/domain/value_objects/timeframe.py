"""Canonical timeframe value object."""

from dataclasses import dataclass

# Canonical timeframe definitions (code -> seconds)
TIMEFRAME_SECONDS: dict[str, int] = {
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
}


@dataclass(frozen=True, slots=True)
class Timeframe:
    """Immutable timeframe identified by canonical code."""

    code: str

    @property
    def seconds(self) -> int:
        return TIMEFRAME_SECONDS[self.code]

    def __post_init__(self) -> None:
        if self.code not in TIMEFRAME_SECONDS:
            raise ValueError(f"Unsupported timeframe: {self.code}")


def parse_timeframe(code: str) -> Timeframe:
    """Parse and validate a timeframe code."""
    return Timeframe(code=code.lower())
