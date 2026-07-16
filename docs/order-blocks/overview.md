# Order Blocks — Sprint 6A

Institutional order block detection integrated with the Market Structure plugin and Analysis Engine.

## Overview

The `order_blocks` plugin identifies supply/demand zones created by the last opposing candle cluster immediately before a **confirmed** Break of Structure (BOS) from Market Structure analysis. Results are persisted per bar in `analysis_results` (JSONB) and exposed via dedicated REST endpoints.

## Detection Algorithm

### Bullish Order Block

1. Market Structure confirms a **bullish BOS** (close crosses above the last swing high).
2. Scan backward from the BOS bar for the most recent **bearish candle cluster** (up to `cluster_max_bars`, within `lookback_before_bos`).
3. Define the zone:
   - **Body mode** (default): `zone_low` = cluster low, `zone_high` = max open of cluster candles.
   - **Wick mode**: `zone_low` = cluster low, `zone_high` = cluster high.
4. Assign a unique `order_block_id`, strength score, and explanation.

### Bearish Order Block

Mirror logic using a confirmed **bearish BOS** and the last **bullish candle cluster** before the break.

### Integration with Market Structure

The plugin runs `MarketStructureAnalyzer` internally with aligned `swing_sensitivity` — no changes to the Market Structure plugin. Only BOS events emitted by the same deterministic rules are used (false breaks that MS does not confirm are ignored).

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `timeframe_code` | `1h` | Originating timeframe metadata stored on each block |
| `zone_mode` | `body` | `body` or `wick` zone bounds |
| `invalidation_mode` | `close` | `close` or `wick` for invalidation |
| `cluster_max_bars` | `3` | Max candles in opposing cluster |
| `lookback_before_bos` | `20` | Max bars to search before BOS |
| `swing_sensitivity` | `2` | Passed to Market Structure for BOS |
| `atr_period` | `14` | ATR period for strength scoring |
| `max_active_blocks` | `50` | Cap on concurrently tracked blocks |
| `strength_weight_*` | see plugin | Weights for score components (sum need not equal 1) |

## Strength Scoring (0–100)

Weighted average of normalized components:

| Component | Description |
|-----------|-------------|
| `bos_strength` | Market Structure confidence at BOS bar × 100 |
| `volume_ratio` | Cluster volume vs 20-bar average |
| `atr_expansion` | ATR at BOS vs prior ATR |
| `impulse_move` | Post-BOS move size relative to ATR |
| `age_factor` | Decays as block ages (2 points per bar) |
| `reaction_count` | Successful bounces from zone × 25 (cap 100) |

Both `strength_score` and `strength_components` are returned for explainability.

## Mitigation

| State | Rule |
|-------|------|
| `untouched` | Price has not entered the zone |
| `first_touch` | First distinct entry into zone |
| `partially_mitigated` | Zone penetration > 35% on touch |
| `fully_mitigated` | Zone penetration ≥ 85% |

Each transition appends a timestamped event to `mitigation_events`. `touch_count` increments only on **new** zone entries (not every overlapping bar).

**Status** becomes `mitigated` once any touch occurs; `fresh` until first touch.

## Invalidation

| Type | Invalidation |
|------|--------------|
| Bullish OB | Price closes (or wicks, if configured) **below** `zone_low` |
| Bearish OB | Price closes (or wicks) **above** `zone_high` |

Stores `invalidation_at` and `invalidation_reason`. Status becomes `invalidated`.

## Per-Bar Output (`analysis_results.values`)

```json
{
  "timeframe_code": "1h",
  "active_order_blocks": [],
  "new_order_blocks": [],
  "mitigated_order_blocks": [],
  "invalidated_order_blocks": [],
  "active_count": 0,
  "confidence": 0.0
}
```

Each order block object includes: `order_block_id`, `type`, `zone_high`, `zone_low`, `status`, `mitigation_state`, `touch_count`, `strength_score`, `strength_components`, `confidence`, `explanation`, `created_at`, `source_candle_indices`, `bos_index`, and invalidation fields when applicable.

## API

Base path: `/api/v1/order-blocks`

### Execute analysis

```http
POST /api/v1/order-blocks/execute
Content-Type: application/json

{
  "symbol_id": "550e8400-e29b-41d4-a716-446655440000",
  "timeframe": "1h",
  "parameters": {
    "zone_mode": "body",
    "swing_sensitivity": 2
  },
  "candle_limit": 5000,
  "persist": true
}
```

### Retrieve active blocks

```http
GET /api/v1/order-blocks/active/{symbol_id}?timeframe=1h
```

### Historical / mitigated / invalidated

```http
GET /api/v1/order-blocks/historical/{symbol_id}?timeframe=1h&limit=500
GET /api/v1/order-blocks/mitigated/{symbol_id}?timeframe=1h
GET /api/v1/order-blocks/invalidated/{symbol_id}?timeframe=1h
```

### Raw per-bar results

```http
GET /api/v1/order-blocks/results/{symbol_id}?timeframe=1h&limit=500
```

## Replay & Live Safety

- Single-pass **O(n)** processing over deduplicated candles (last bar wins per `open_time`).
- Market Structure BOS uses causal swing confirmation (lag = `swing_sensitivity`).
- Identical input produces identical output on batch replay and incremental live feeds.
- Plugin declares `dependencies = ["market_structure"]` for engine ordering when both plugins run in one request.

## Plugin Registration

- Plugin ID: `order_blocks`
- Version: `1.0.0`
- Category: `smart_money`
- Registered in `app/engines/analysis/plugins/__init__.py`

## Tests

- `tests/unit/test_order_block.py` — detection, mitigation, replay, gaps, performance
- `tests/api/test_order_block_api.py` — REST contract

Run:

```bash
pytest tests/unit/test_order_block.py tests/api/test_order_block_api.py -v
```
