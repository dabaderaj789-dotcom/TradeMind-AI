# Trade Setup Engine — Sprint 7

High-level institutional trade setup detection from Analysis Engine evidence.

## Overview

The Trade Setup Engine is a **separate engine** (`app/engines/trade_setup/`) that consumes persisted outputs from source plugins without modifying them. It identifies high-quality trading **opportunities** — not buy/sell signals.

### Source Plugins

| Plugin | Evidence Contributed |
|--------|---------------------|
| `market_structure` | Trend, BOS, CHoCH, phase, S/R levels |
| `order_blocks` | Fresh/mitigated order blocks |
| `fair_value_gaps` | Open/filled FVGs |
| `liquidity_sweeps` | Confirmed sweeps |
| `rsi`, `vwap`, `atr` | Indicator confirmation |

## Architecture

```
Analysis Plugins → analysis_results (JSONB)
                         ↓
              Trade Setup Loader (aligned context)
                         ↓
              Evidence Extractor
                         ↓
              Setup Detector Registry (pluggable)
                         ↓
              Confidence Scorer
                         ↓
         trade_setup_runs + trade_setups tables
```

### Extensibility

New setup types are added by implementing `SetupDetector` and registering in `build_default_registry()` — no engine core changes required.

## Setup Types (Phase 1)

| Type | Detection Summary |
|------|-------------------|
| `trend_continuation` | Established trend + pullback into OB/FVG |
| `pullback` | Trend + mitigated OB or filled FVG retest |
| `breakout` | BOS + SMC/volume confluence |
| `reversal` | CHoCH + confirmed liquidity sweep |
| `range_rejection` | Ranging phase + boundary sweep rejection |

## Evidence Model

Each bar produces evidence scores (0–100) per contributor:

- `bullish_bos`, `bearish_bos`, `choch_bullish`, `choch_bearish`
- `fresh_order_block_*`, `mitigated_order_block_*`
- `open_fvg_*`, `filled_fvg_*`
- `liquidity_sweep_buy_side`, `liquidity_sweep_sell_side`
- `trend_alignment_*`, `range_context`
- `rsi_oversold`, `rsi_overbought`, `vwap_above`, `vwap_below`
- `volume_confirmation`

Weights are configurable via `parameters.evidence_weights`.

## Confidence Calculation

```
confidence = Σ(evidence_score × weight) / Σ(weight × 100) × 100
```

| Level | Score |
|-------|-------|
| Very High | ≥ 85 |
| High | ≥ 70 |
| Medium | ≥ 50 |
| Low | < 50 |

Returns `confidence_score`, per-evidence breakdown, and `confidence_level`.

## Setup Output

Each setup includes:

- `setup_id`, `setup_type`, `direction` (bullish/bearish)
- `entry_zone`, `stop_loss_zone`, `target_zones` (target_1, target_2)
- `risk_reward`, `evidence_scores`, `explanation`
- `reference_ids` (linked OB, sweep, BOS)
- `status`: `active`, `expired`, `invalidated`
- `expires_index` for expiration rules

**Note:** This engine identifies opportunities only — it does not generate buy/sell signals.

## Database Schema

### `trade_setup_runs`

| Column | Description |
|--------|-------------|
| `id` | Run UUID |
| `symbol_id`, `timeframe_id` | Instrument |
| `engine_version`, `params_hash` | Reproducible versioning |
| `config` | Engine parameters used |
| `analysis_snapshot` | Plugin params_hashes used |
| `setups_detected`, `bars_scanned` | Run metrics |
| `computed_at` | Timestamp |

### `trade_setups`

| Column | Description |
|--------|-------------|
| `setup_id` | Primary key |
| `run_id` | FK to run |
| `engine_version`, `params_hash` | Version for backtest reproducibility |
| `setup_type`, `direction` | Classification |
| `confidence_score`, `confidence_level` | Scoring |
| `evidence_scores`, `entry_zone`, `stop_loss_zone`, `target_zones` | JSONB |
| `risk_reward`, `status`, `explanation` | Trade structure |
| `detected_at`, `expires_index` | Lifecycle |

Migration: `004_trade_setup_engine.py`

## API

Base path: `/api/v1/trade-setups`

```http
POST /api/v1/trade-setups/execute
GET  /api/v1/trade-setups/active/{symbol_id}?timeframe=1h&setup_type=breakout&min_confidence=70
GET  /api/v1/trade-setups/historical/{symbol_id}?timeframe=1h&direction=bullish
GET  /api/v1/trade-setups/details/{symbol_id}?timeframe=1h&setup_id=SETUP_ID
```

### Execute example

```bash
curl -X POST http://localhost:8000/api/v1/trade-setups/execute \
  -H "Content-Type: application/json" \
  -d '{
    "symbol_id": "YOUR_SYMBOL_UUID",
    "timeframe": "1h",
    "incremental": true,
    "parameters": {
      "min_confidence": 50,
      "scan_bars": 50,
      "evidence_weights": {"bullish_bos": 1.5}
    }
  }'
```

### Prerequisites

Source plugin analysis must exist in `analysis_results`. Use `ensure_analysis: true` to run missing plugins once, or execute analysis separately to avoid recalculation.

## Performance

- Loads **stored** analysis only (no plugin re-execution by default)
- `incremental: true` scans only `scan_bars` recent bars (default 50)
- `analysis_snapshot` records plugin `params_hash` values for reproducibility
- O(bars × detectors) deterministic single pass

## Replay Safety

Identical aligned analysis input + engine version + params_hash → identical setup detection (IDs are unique per run but structure is reproducible).

## Tests

```bash
pytest tests/unit/test_trade_setup.py tests/integration/test_trade_setup_integration.py tests/api/test_trade_setup_api.py -v
```
