# Smart Money Concepts (SMC) Design

## Overview

Detects institutional price action patterns: order blocks, liquidity zones, market structure breaks, and fair value gaps.

## Components

| Module | Detects |
|--------|---------|
| `structure.py` | Break of Structure (BOS), Change of Character (CHoCH) |
| `order_blocks.py` | Bullish/bearish order blocks |
| `liquidity.py` | Buy-side/sell-side liquidity pools, sweeps |
| `fvg.py` | Fair Value Gaps (imbalances) |

## Input

Candle data + optional volume profile. Minimum 200 bars for structure analysis.

## Output Schema

```json
{
  "order_blocks": [{"type": "bullish", "high": 2450.5, "low": 2430.0, "time": "..."}],
  "liquidity_zones": [{"type": "sell_side", "price": 2500.0, "strength": 0.85}],
  "structure": {"trend": "bullish", "last_bos": "...", "last_choch": null},
  "fvgs": [{"type": "bullish", "high": 2445.0, "low": 2440.0, "filled": false}]
}
```

## Integration

- Scanner filters by SMC patterns
- Strategies consume SMC via `StrategyContext`
- Alerts on liquidity sweeps and BOS events

## Storage

SMC results computed on-demand (not persisted initially). Future: `smc_analysis` table if caching needed.

## API

See [Smart Money Endpoints](../api/endpoints.md#8-smart-money-concepts).
