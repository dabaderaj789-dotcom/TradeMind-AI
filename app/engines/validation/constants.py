"""Validation toolkit constants."""

from __future__ import annotations

from enum import StrEnum


class ValidationVerdict(StrEnum):
    CORRECT = "correct"
    INCORRECT = "incorrect"
    UNSURE = "unsure"


class RejectionReason(StrEnum):
    WEAK_ORDER_BLOCK = "weak_order_block"
    FALSE_BOS = "false_bos"
    FALSE_CHOCH = "false_choch"
    INVALID_FVG = "invalid_fvg"
    FALSE_LIQUIDITY_SWEEP = "false_liquidity_sweep"
    POOR_MARKET_STRUCTURE = "poor_market_structure"
    WRONG_SETUP_CLASSIFICATION = "wrong_setup_classification"
    TIMING_ENTRY_ISSUE = "timing_entry_issue"
    MISSING_CONFLUENCE = "missing_confluence"
    OTHER = "other"


REJECTION_REASON_LABELS: dict[str, str] = {
    RejectionReason.WEAK_ORDER_BLOCK: "Weak Order Block detection",
    RejectionReason.FALSE_BOS: "False BOS event",
    RejectionReason.FALSE_CHOCH: "False CHoCH event",
    RejectionReason.INVALID_FVG: "Invalid FVG",
    RejectionReason.FALSE_LIQUIDITY_SWEEP: "False liquidity sweep",
    RejectionReason.POOR_MARKET_STRUCTURE: "Poor market structure context",
    RejectionReason.WRONG_SETUP_CLASSIFICATION: "Wrong setup type classification",
    RejectionReason.TIMING_ENTRY_ISSUE: "Timing / entry zone issue",
    RejectionReason.MISSING_CONFLUENCE: "Missing confluence evidence",
    RejectionReason.OTHER: "Other",
}

REASON_TO_PLUGIN: dict[str, str] = {
    RejectionReason.WEAK_ORDER_BLOCK: "order_blocks",
    RejectionReason.FALSE_BOS: "market_structure",
    RejectionReason.FALSE_CHOCH: "market_structure",
    RejectionReason.INVALID_FVG: "fair_value_gaps",
    RejectionReason.FALSE_LIQUIDITY_SWEEP: "liquidity_sweeps",
    RejectionReason.POOR_MARKET_STRUCTURE: "market_structure",
    RejectionReason.WRONG_SETUP_CLASSIFICATION: "trade_setup",
    RejectionReason.TIMING_ENTRY_ISSUE: "trade_setup",
    RejectionReason.MISSING_CONFLUENCE: "trade_setup",
    RejectionReason.OTHER: "trade_setup",
}

PLUGIN_LABELS: dict[str, str] = {
    "market_structure": "Market Structure",
    "order_blocks": "Order Blocks",
    "fair_value_gaps": "Fair Value Gaps",
    "liquidity_sweeps": "Liquidity Sweeps",
    "trade_setup": "Trade Setup",
}


def plugin_issues_from_reason(reason: str | None, extra: list[str] | None = None) -> list[str]:
    issues: list[str] = []
    if reason and reason in REASON_TO_PLUGIN:
        plugin = REASON_TO_PLUGIN[reason]
        if plugin not in issues:
            issues.append(plugin)
    for p in extra or []:
        if p in PLUGIN_LABELS and p not in issues:
            issues.append(p)
    return issues
