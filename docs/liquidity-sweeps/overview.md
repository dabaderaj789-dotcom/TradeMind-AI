# Liquidity Sweeps — Sprint 6C

Institutional liquidity sweep detection integrated with Market Structure, Order Blocks, and Fair Value Gaps.

## Overview

The `liquidity_sweeps` plugin detects buy-side and sell-side liquidity sweeps above swing/equal highs and below swing/equal lows. Each sweep is scored, confirmed, and tracked through a lifecycle. Results persist per bar in `analysis_results` (JSONB).

## Detection Algorithm

### Liquidity Levels

Levels are built causally from Market Structure swing confirmations:

| Level | Source |
|-------|--------|
| `swing_high` / `swing_low` | Confirmed MS pivots |
| `equal_high` / `equal_low` | Two+ swings within `equal_level_tolerance_atr × ATR` |
| `session_high` / `session_low` | Optional `session_levels` parameter (future-compatible) |

### Sweep Types

| Type | Location | Penetration |
|------|----------|-------------|
| **Sell-side** | Above highs | `high > level + min_penetration` |
| **Buy-side** | Below lows | `low < level - min_penetration` |

### Sweep Modes

| Mode | Rule |
|------|------|
| `wick` (default) | Same-bar rejection required (close back inside level) |
| `close` | Penetration creates active sweep; confirmation over `confirmation_bars` |

Minimum penetration: `min_penetration_atr × ATR`. Levels outside `max_lookback` are ignored.

## Confirmation

For each sweep, confirmation components (0–100 each) are evaluated:

| Component | Description |
|-----------|-------------|
| `immediate_rejection` | Close distance from level relative to ATR |
| `volume_expansion` | Sweep bar volume context |
| `atr_expansion` | Penetration relative to ATR |
| `bos_confirmation` | BOS alignment with sweep direction |
| `choch_confirmation` | CHoCH alignment with sweep direction |
| `order_block_proximity` | Nearest active Order Block overlap/nearness |
| `fvg_proximity` | Nearest active FVG overlap/nearness |
| `trend_alignment` | Sweep direction vs current trend |

Average confirmation score ≥ `confirmation_threshold` (default 50) → **Confirmed**.

## Strength Scoring (0–100)

| Component | Description |
|-----------|-------------|
| `penetration_depth` | How far price swept through the level |
| `rejection_strength` | Magnitude of rejection after sweep |
| `volume` | Sweep bar volume |
| `atr` | Sweep bar range / ATR |
| `market_structure_context` | MS confidence at sweep bar |
| `smart_money_context` | OB/FVG proximity |

Returns `strength_score` and `strength_components`.

## Lifecycle

| Status | Description |
|--------|-------------|
| `active` | Detected, pending confirmation |
| `confirmed` | Confirmation criteria met |
| `failed` | Continuation through level or confirmation timeout |
| `invalidated` | Confirmed sweep expired from active tracking |

State transitions are recorded in `lifecycle_events` with timestamps.

## Context

Each sweep includes:

- `trend`, `market_phase`
- `associated_bos`, `associated_choch`
- `related_order_block_id`, `related_fvg_id`
- `nearest_swing_index`, `nearest_swing_price`
- `confidence`, `explanation`

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `timeframe_code` | `1h` | Originating timeframe metadata |
| `sweep_mode` | `wick` | `wick` or `close` |
| `min_penetration_atr` | `0.05` | Minimum sweep depth in ATR units |
| `max_lookback` | `100` | Max bars to look back for levels |
| `equal_level_tolerance_atr` | `0.15` | Equal high/low clustering tolerance |
| `confirmation_bars` | `3` | Bars to confirm close-mode sweeps |
| `confirmation_threshold` | `50.0` | Min avg confirmation score |
| `include_order_blocks` | `true` | Use OB analyzer for context |
| `include_fvgs` | `true` | Use FVG analyzer for context |
| `session_levels` | `[]` | External session high/low levels |

## API

Base path: `/api/v1/liquidity-sweeps`

```http
POST /api/v1/liquidity-sweeps/execute
GET  /api/v1/liquidity-sweeps/active/{symbol_id}?timeframe=1h
GET  /api/v1/liquidity-sweeps/historical/{symbol_id}?timeframe=1h
GET  /api/v1/liquidity-sweeps/failed/{symbol_id}?timeframe=1h
GET  /api/v1/liquidity-sweeps/details/{symbol_id}?timeframe=1h&sweep_id=SWEEP_ID
GET  /api/v1/liquidity-sweeps/results/{symbol_id}?timeframe=1h
```

### Execute example

```bash
curl -X POST http://localhost:8000/api/v1/liquidity-sweeps/execute \
  -H "Content-Type: application/json" \
  -d '{
    "symbol_id": "YOUR_SYMBOL_UUID",
    "timeframe": "1h",
    "parameters": {
      "sweep_mode": "wick",
      "min_penetration_atr": 0.05
    }
  }'
```

## Replay & Live Safety

- Single-pass **O(n)** over deduplicated candles.
- Swing levels confirmed with MS causal lag (`swing_sensitivity`).
- Identical results on batch replay and incremental live feeds.
- Plugin dependencies: `market_structure`, `order_blocks`, `fair_value_gaps`.

## Plugin Registration

- Plugin ID: `liquidity_sweeps`
- Version: `1.0.0`
- Category: `smart_money`

## Tests

```bash
pytest tests/unit/test_liquidity_sweep.py tests/api/test_liquidity_sweep_api.py -v
```
