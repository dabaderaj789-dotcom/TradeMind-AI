# Fair Value Gaps — Sprint 6B

Institutional Fair Value Gap (FVG) detection integrated with Market Structure and Order Block context.

## Overview

The `fair_value_gaps` plugin identifies three-candle imbalances (bullish and bearish), scores gap quality, tracks fill lifecycle, and associates each gap with market structure and nearest order block. Results persist per bar in `analysis_results` (JSONB).

## Detection Rules

### Three-Candle Logic

On bar index `i` (requires `i >= 2`), candles `i-2`, `i-1`, `i` are evaluated:

| Type | Wick mode (default) | Body mode |
|------|---------------------|-----------|
| **Bullish** | `high[i-2] < low[i]` | `max(open,close)[i-2] < min(open,close)[i]` |
| **Bearish** | `low[i-2] > high[i]` | `min(open,close)[i-2] > max(open,close)[i]` |

Additional filters:

- Middle candle (`i-1`) must be impulse-aligned (bullish close > open for bullish FVG; bearish close < open for bearish FVG).
- `gap_size >= min_gap_atr_ratio × ATR`
- `gap_percent >= min_gap_percent`

### Stored Fields

Each FVG stores: `gap_high`, `gap_low`, `gap_size`, `gap_percent`, `created_at`, `source_candle_indices`, `type`, and context fields.

## Gap Quality Scoring (0–100)

Weighted average of:

| Component | Description |
|-----------|-------------|
| `gap_size_atr` | Gap size relative to ATR |
| `impulse_strength` | Middle candle body / ATR |
| `volume_expansion` | Middle candle volume vs 20-bar average |
| `structure_alignment` | MS confidence + BOS/CHoCH alignment bonus |
| `order_block_proximity` | Overlap or distance to nearest active OB (in ATR) |
| `trend_alignment` | FVG direction vs current trend |

Returns `quality_score` and `quality_components` for explainability.

## Fill Lifecycle

| State | Rule |
|-------|------|
| `open` | No price entry into gap |
| `partially_filled` | Price entered gap; fill % > 0 and < 95 |
| `fully_filled` | Cumulative traded span ≥ 95% of gap |

Recorded fields:

- `first_touch_at` — first bar overlapping gap
- `fill_percentage` — cumulative fill (0–100)
- `full_fill_at` — timestamp when fully filled

## Invalidation

| Mode | Rule |
|------|------|
| `close` (default) | Bullish: close below `gap_low`; Bearish: close above `gap_high` |
| `wick` | Wick beyond same boundaries |
| Time expiration | If `expiration_bars > 0`, open/partial gaps expire after N bars |

Stores `invalidation_at` and `invalidation_reason`.

## Context Association

Each FVG includes:

- `trend`, `market_phase` from Market Structure
- `associated_bos`, `associated_choch` at formation bar
- `associated_order_block_id`, `order_block_distance_atr` from Order Block analyzer
- `confidence` and human-readable `explanation`

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `timeframe_code` | `1h` | Originating timeframe metadata |
| `gap_mode` | `wick` | `wick` or `body` three-candle bounds |
| `min_gap_atr_ratio` | `0.05` | Minimum gap / ATR |
| `min_gap_percent` | `0.01` | Minimum gap % of price |
| `invalidation_mode` | `close` | `close` or `wick` |
| `expiration_bars` | `0` | Time-based expiry (0 = off) |
| `include_order_blocks` | `true` | Run OB analyzer for proximity context |
| `quality_weight_*` | see plugin | Quality component weights |

## API

Base path: `/api/v1/fair-value-gaps`

```http
POST /api/v1/fair-value-gaps/execute
GET  /api/v1/fair-value-gaps/active/{symbol_id}?timeframe=1h
GET  /api/v1/fair-value-gaps/historical/{symbol_id}?timeframe=1h
GET  /api/v1/fair-value-gaps/filled/{symbol_id}?timeframe=1h
GET  /api/v1/fair-value-gaps/invalidated/{symbol_id}?timeframe=1h
GET  /api/v1/fair-value-gaps/results/{symbol_id}?timeframe=1h
```

### Execute example

```bash
curl -X POST http://localhost:8000/api/v1/fair-value-gaps/execute \
  -H "Content-Type: application/json" \
  -d '{
    "symbol_id": "YOUR_SYMBOL_UUID",
    "timeframe": "1h",
    "parameters": {"gap_mode": "wick", "min_gap_atr_ratio": 0.05}
  }'
```

## Replay & Live Safety

- Single-pass **O(n)** over deduplicated candles.
- FVG confirmed only when the third candle completes (causal).
- Identical batch and incremental results for the same candle history.
- Plugin dependencies: `market_structure`, `order_blocks`.

## Plugin Registration

- Plugin ID: `fair_value_gaps`
- Version: `1.0.0`
- Category: `smart_money`

## Tests

```bash
pytest tests/unit/test_fvg.py tests/api/test_fvg_api.py -v
```
