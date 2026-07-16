# Validation Toolkit

Engineering workflow for reviewing trade setup quality and measuring analysis accuracy.

## Overview

The Validation Toolkit extends Replay Studio with human review capabilities. Reviewers mark detected setups as **Correct**, **Incorrect**, or **Unsure**, add notes, and export results for offline analysis.

No trading logic is modified — this sprint is validation and reporting only.

## Validation Mode (Replay Studio)

1. Start a replay session
2. Enable **Validation Mode** in the right sidebar
3. Step to a bar with a trade setup
4. Select verdict, optional rejection reason (required for Incorrect), and notes
5. Save review — upserts one review per setup

Only setups at or before the current replay index are reviewable (no future reveal).

## Review Verdicts

| Verdict | Description |
|---------|-------------|
| `correct` | Setup detection is accurate |
| `incorrect` | Setup is a false positive or misclassified |
| `unsure` | Needs further review |

## Rejection Reasons

When marking **Incorrect**, select a reason:

| Reason | Plugin |
|--------|--------|
| Weak Order Block detection | Order Blocks |
| False BOS event | Market Structure |
| False CHoCH event | Market Structure |
| Invalid FVG | Fair Value Gaps |
| False liquidity sweep | Liquidity Sweeps |
| Poor market structure context | Market Structure |
| Wrong setup type classification | Trade Setup |
| Timing / entry zone issue | Trade Setup |
| Missing confluence evidence | Trade Setup |
| Other | Trade Setup |

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/validation/reviews` | Submit or update review |
| GET | `/validation/reviews/{setup_id}` | Get review |
| GET | `/validation/reviews` | List reviews (filterable) |
| GET | `/validation/dashboard` | Dashboard metrics |
| GET | `/validation/report` | Recurring issues report |
| GET | `/validation/export.csv` | CSV export |
| GET | `/validation/rejection-reasons` | Reason options |
| GET | `/validation/sessions/{id}/setups` | Setup queue with review status |

### Filters (dashboard, report, export, list)

- `symbol_id`
- `timeframe`
- `strategy_id`
- `setup_type`
- `start` / `end` (detected_at range)

## Dashboard Metrics

- Total reviewed setups
- Acceptance / rejection / unsure rates
- Most common rejection reasons
- Plugin-level statistics (flagged reviews, incorrect count, rate)
- Setup type breakdown

## Recurring Issues Report

Analyzes incorrect reviews to surface patterns:

- Top rejection reasons by frequency
- Plugin-level issue counts
- Actionable recommendations (e.g. "Review BOS detection thresholds")

## CSV Export

Columns: setup_id, symbol, timeframe, setup_type, strategy_id, direction, detected_at, verdict, rejection_reason, plugin_issues, notes, confidence_score, reviewer, reviewed_at.

## Database (Migration 006)

Table: `setup_validation_reviews` — one review per setup (upsert on re-review).

## Tests

```bash
pytest tests/unit/test_validation.py tests/api/test_validation_api.py -v
```
