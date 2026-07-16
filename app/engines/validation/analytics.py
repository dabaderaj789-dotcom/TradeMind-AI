"""Validation analytics — dashboard and recurring issues report."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from app.engines.validation.constants import PLUGIN_LABELS, REJECTION_REASON_LABELS, ValidationVerdict


def compute_dashboard(reviews: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(reviews)
    if total == 0:
        return _empty_dashboard()

    verdict_counts = Counter(r["verdict"] for r in reviews)
    correct = verdict_counts.get(ValidationVerdict.CORRECT, 0)
    incorrect = verdict_counts.get(ValidationVerdict.INCORRECT, 0)
    unsure = verdict_counts.get(ValidationVerdict.UNSURE, 0)

    rejection_reasons = Counter(
        r["rejection_reason"]
        for r in reviews
        if r.get("verdict") == ValidationVerdict.INCORRECT and r.get("rejection_reason")
    )

    plugin_stats: dict[str, dict[str, int | float]] = {}
    for plugin_id, label in PLUGIN_LABELS.items():
        plugin_reviews = [r for r in reviews if plugin_id in (r.get("plugin_issues") or [])]
        plugin_incorrect = sum(
            1 for r in plugin_reviews if r.get("verdict") == ValidationVerdict.INCORRECT
        )
        plugin_total = len(plugin_reviews)
        plugin_stats[plugin_id] = {
            "label": label,
            "flagged_reviews": plugin_total,
            "incorrect_count": plugin_incorrect,
            "incorrect_rate_pct": round(plugin_incorrect / plugin_total * 100, 2) if plugin_total else 0.0,
        }

    setup_type_stats: dict[str, dict[str, int | float]] = {}
    by_type: dict[str, list] = defaultdict(list)
    for r in reviews:
        by_type[r.get("setup_type", "unknown")].append(r)
    for setup_type, items in by_type.items():
        inc = sum(1 for r in items if r.get("verdict") == ValidationVerdict.INCORRECT)
        setup_type_stats[setup_type] = {
            "total": len(items),
            "incorrect": inc,
            "incorrect_rate_pct": round(inc / len(items) * 100, 2) if items else 0.0,
        }

    return {
        "total_reviewed": total,
        "correct_count": correct,
        "incorrect_count": incorrect,
        "unsure_count": unsure,
        "acceptance_rate_pct": round(correct / total * 100, 2),
        "rejection_rate_pct": round(incorrect / total * 100, 2),
        "unsure_rate_pct": round(unsure / total * 100, 2),
        "rejection_reasons": [
            {
                "reason": reason,
                "label": REJECTION_REASON_LABELS.get(reason, reason),
                "count": count,
            }
            for reason, count in rejection_reasons.most_common()
        ],
        "plugin_statistics": plugin_stats,
        "setup_type_statistics": setup_type_stats,
    }


def compute_recurring_issues(reviews: list[dict[str, Any]]) -> dict[str, Any]:
    incorrect = [r for r in reviews if r.get("verdict") == ValidationVerdict.INCORRECT]
    if not incorrect:
        return {
            "summary": "No incorrect reviews found for the selected filters.",
            "issues": [],
            "recommendations": [],
        }

    reason_counts = Counter(r.get("rejection_reason") for r in incorrect if r.get("rejection_reason"))
    plugin_counts = Counter()
    for r in incorrect:
        for p in r.get("plugin_issues") or []:
            plugin_counts[p] += 1

    issues: list[dict[str, Any]] = []

    for reason, count in reason_counts.most_common(5):
        pct = round(count / len(incorrect) * 100, 1)
        label = REJECTION_REASON_LABELS.get(reason, reason)
        issues.append({
            "category": "rejection_reason",
            "key": reason,
            "label": label,
            "count": count,
            "pct_of_incorrect": pct,
            "severity": _severity(pct),
        })

    for plugin_id, count in plugin_counts.most_common():
        pct = round(count / len(incorrect) * 100, 1)
        issues.append({
            "category": "plugin",
            "key": plugin_id,
            "label": PLUGIN_LABELS.get(plugin_id, plugin_id),
            "count": count,
            "pct_of_incorrect": pct,
            "severity": _severity(pct),
        })

    issues.sort(key=lambda x: (-x["count"], x["label"]))

    recommendations = _build_recommendations(reason_counts, plugin_counts, len(incorrect))

    return {
        "summary": (
            f"Analyzed {len(incorrect)} incorrect reviews. "
            f"Top issue: {issues[0]['label']} ({issues[0]['count']} occurrences)."
            if issues
            else "No patterns detected."
        ),
        "incorrect_total": len(incorrect),
        "issues": issues,
        "recommendations": recommendations,
    }


def _severity(pct: float) -> str:
    if pct >= 40:
        return "high"
    if pct >= 20:
        return "medium"
    return "low"


def _build_recommendations(
    reason_counts: Counter,
    plugin_counts: Counter,
    incorrect_total: int,
) -> list[str]:
    recs: list[str] = []
    if reason_counts.get("false_bos", 0) >= max(2, incorrect_total * 0.15):
        recs.append(
            "Review Market Structure BOS detection thresholds — excessive false BOS events reported."
        )
    if reason_counts.get("weak_order_block", 0) >= max(2, incorrect_total * 0.15):
        recs.append(
            "Order Block strength scoring may be too permissive — consider tightening freshness or BOS confluence requirements."
        )
    if reason_counts.get("invalid_fvg", 0) >= max(2, incorrect_total * 0.1):
        recs.append(
            "FVG quality filters may need adjustment — invalid gap detections are recurring."
        )
    if reason_counts.get("false_liquidity_sweep", 0) >= max(2, incorrect_total * 0.1):
        recs.append(
            "Liquidity sweep confirmation logic should be reviewed for false positives."
        )
    if plugin_counts.get("trade_setup", 0) >= max(2, incorrect_total * 0.2):
        recs.append(
            "Trade Setup Engine classification or confidence thresholds may need recalibration."
        )
    if not recs:
        recs.append("Continue collecting reviews to identify stronger patterns.")
    return recs


def _empty_dashboard() -> dict[str, Any]:
    return {
        "total_reviewed": 0,
        "correct_count": 0,
        "incorrect_count": 0,
        "unsure_count": 0,
        "acceptance_rate_pct": 0.0,
        "rejection_rate_pct": 0.0,
        "unsure_rate_pct": 0.0,
        "rejection_reasons": [],
        "plugin_statistics": {k: {"label": v, "flagged_reviews": 0, "incorrect_count": 0, "incorrect_rate_pct": 0.0} for k, v in PLUGIN_LABELS.items()},
        "setup_type_statistics": {},
    }
