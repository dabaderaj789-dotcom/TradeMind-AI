"""Unit tests for validation analytics."""

from app.engines.validation.analytics import compute_dashboard, compute_recurring_issues
from app.engines.validation.constants import ValidationVerdict


def test_dashboard_acceptance_rates() -> None:
    reviews = [
        {"verdict": ValidationVerdict.CORRECT, "rejection_reason": None, "plugin_issues": [], "setup_type": "breakout"},
        {"verdict": ValidationVerdict.CORRECT, "rejection_reason": None, "plugin_issues": [], "setup_type": "breakout"},
        {"verdict": ValidationVerdict.INCORRECT, "rejection_reason": "false_bos", "plugin_issues": ["market_structure"], "setup_type": "breakout"},
        {"verdict": ValidationVerdict.UNSURE, "rejection_reason": None, "plugin_issues": [], "setup_type": "pullback"},
    ]
    dash = compute_dashboard(reviews)
    assert dash["total_reviewed"] == 4
    assert dash["acceptance_rate_pct"] == 50.0
    assert dash["rejection_rate_pct"] == 25.0
    assert dash["plugin_statistics"]["market_structure"]["incorrect_count"] == 1


def test_recurring_issues_report() -> None:
    reviews = [
        {"verdict": ValidationVerdict.INCORRECT, "rejection_reason": "false_bos", "plugin_issues": ["market_structure"], "setup_type": "breakout"},
        {"verdict": ValidationVerdict.INCORRECT, "rejection_reason": "false_bos", "plugin_issues": ["market_structure"], "setup_type": "breakout"},
        {"verdict": ValidationVerdict.INCORRECT, "rejection_reason": "weak_order_block", "plugin_issues": ["order_blocks"], "setup_type": "pullback"},
    ]
    report = compute_recurring_issues(reviews)
    assert report["incorrect_total"] == 3
    assert len(report["issues"]) > 0
    assert len(report["recommendations"]) > 0
