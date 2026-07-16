"""Shared strategy evaluation helpers."""

from __future__ import annotations

from app.engines.strategy.types import SetupInput


def evidence_score(setup: SetupInput, *keys: str, default: float = 0.0) -> float:
    for key in keys:
        val = setup.evidence_scores.get(key)
        if val is not None and val > 0:
            return float(val)
    return default


def has_reference(setup: SetupInput, key: str) -> bool:
    val = setup.reference_ids.get(key)
    return val is not None and val != ""


def entry_mid(setup: SetupInput) -> float:
    return (float(setup.entry_zone["high"]) + float(setup.entry_zone["low"])) / 2


def stop_price(setup: SetupInput, direction: str) -> float:
    zone = setup.stop_loss_zone
    if direction == "bullish":
        return float(zone["low"])
    return float(zone["high"])


def targets_from_setup(setup: SetupInput) -> tuple[float, float, float | None]:
    zones = setup.target_zones or []
    t1 = float(zones[0]["high"]) if len(zones) > 0 else entry_mid(setup)
    t2 = float(zones[1]["high"]) if len(zones) > 1 else t1
    t3 = float(zones[2]["high"]) if len(zones) > 2 else None
    if setup.direction == "bearish":
        t1 = float(zones[0]["low"]) if len(zones) > 0 else entry_mid(setup)
        t2 = float(zones[1]["low"]) if len(zones) > 1 else t1
        t3 = float(zones[2]["low"]) if len(zones) > 2 else None
    return t1, t2, t3


def compute_rr(entry: float, stop: float, target: float) -> float:
    risk = abs(entry - stop)
    reward = abs(target - entry)
    return round(reward / risk, 4) if risk > 0 else 0.0
