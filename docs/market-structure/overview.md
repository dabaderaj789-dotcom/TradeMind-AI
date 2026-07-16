# Market Structure Engine (Sprint 5)

Market Structure is implemented as an **Analysis Engine plugin** (`market_structure`) — no changes to the core engine architecture.

## Algorithm Overview

Single-pass **O(n)** analyzer processing candles sequentially (batch, replay, and live compatible).

```
Candles → Swing Detection → Structure Classification → BOS/CHoCH → Phase → Dynamic Levels
```

## Swing Detection

- **Pivot confirmation:** A swing high/low at bar `i` is confirmed after `swing_sensitivity` bars (default 2) on each side.
- **Causal confirmation** ensures replay/live compatibility — swings are only labeled once confirmed.
- **Classification** vs previous swing of same type:
  - Higher high → `HH`
  - Higher low → `HL`
  - Lower high → `LH`
  - Lower low → `LL`

### Swing Strength Score (0–1)

| Factor | Weight |
|--------|--------|
| Volume vs 20-bar average | 30% |
| Distance from previous swing / ATR | 30% |
| Label confirmations | 20% |
| Bar range / ATR | 20% |

## Trend Detection

Derived from recent swing labels (not moving averages):

| Trend | Condition |
|-------|-----------|
| Bullish | ≥3 of last swings are HH/HL |
| Bearish | ≥3 of last swings are LH/LL |
| Sideways | Mixed structure |

## Break of Structure (BOS)

| Type | Rule |
|------|------|
| Bullish BOS | Close crosses **above** last swing high (prev close ≤ level < close) |
| Bearish BOS | Close crosses **below** last swing low |

Stored fields: `broken_swing_price`, `break_price`, `break_time`, `break_index`, `swing_index`.

## Change of Character (CHoCH)

CHoCH occurs when BOS opposes the prevailing trend:

- Bullish CHoCH: Bullish BOS during bearish trend
- Bearish CHoCH: Bearish BOS during bullish trend

## Market Phase

| Phase | Criteria |
|-------|----------|
| Trending | Clear bullish or bearish swing structure |
| Ranging | Wide oscillation, mixed swings |
| Accumulation | Sideways after higher lows forming |
| Distribution | Sideways after lower highs forming |

Returns `phase_confidence` (0–1).

## Dynamic Support / Resistance

- Created from confirmed swing lows (support) and swing highs (resistance)
- **Touches** increment when price revisits within `level_touch_tolerance_atr × ATR`
- **Strength** increases with touches (capped at 1.0)
- Top `max_active_levels` (default 5) maintained per side

## Data Model

Stored in `analysis_results` with `plugin_id = market_structure`.

Per-bar JSON output:

```json
{
  "trend": "bullish",
  "swing_type": "HH",
  "swing_strength": 0.72,
  "is_swing_high": true,
  "is_swing_low": false,
  "bos": null,
  "choch": null,
  "market_phase": "trending",
  "phase_confidence": 0.75,
  "confidence": 0.68,
  "support_levels": [...],
  "resistance_levels": [...]
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/market-structure/execute` | Run analysis |
| GET | `/api/v1/market-structure/results/{symbol_id}` | Historical bars |
| GET | `/api/v1/market-structure/trend/{symbol_id}` | Current trend |
| GET | `/api/v1/market-structure/levels/{symbol_id}` | Support/resistance |
| GET | `/api/v1/market-structure/events/{symbol_id}` | BOS/CHoCH history |

### Execute

```bash
curl -X POST http://localhost:8000/api/v1/market-structure/execute \
  -H "Content-Type: application/json" \
  -d '{
    "symbol_id": "YOUR_SYMBOL_UUID",
    "timeframe": "1h",
    "parameters": {"swing_sensitivity": 2},
    "candle_limit": 10000
  }'
```

### Current trend

```bash
curl "http://localhost:8000/api/v1/market-structure/trend/SYMBOL_UUID?timeframe=1h"
```

### Support / Resistance

```bash
curl "http://localhost:8000/api/v1/market-structure/levels/SYMBOL_UUID?timeframe=1h"
```

### BOS / CHoCH history

```bash
curl "http://localhost:8000/api/v1/market-structure/events/SYMBOL_UUID?timeframe=1h"
```

## Performance

- **O(n)** single pass — suitable for 1M+ candles
- No full-history rescans per bar
- Duplicate candles deduplicated by `open_time` (last wins)
- CPU-bound work runs in thread pool via Analysis Engine

## Plugin Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `swing_sensitivity` | 2 | Bars each side for pivot confirmation |
| `atr_period` | 14 | ATR for strength and level tolerance |
| `level_touch_tolerance_atr` | 0.5 | Level touch distance in ATR units |
| `max_active_levels` | 5 | Max support/resistance levels |
| `phase_lookback_swings` | 6 | Swings considered for phase classification |

## Future Consumers

Output is designed for reuse by:

- Smart Money Engine (swing structure context)
- Strategy Engine (trend filters, BOS triggers)
- Signal Engine (structure-based signals)
- AI Feature Engine (structured features per bar)
- Backtesting Engine (replay via same `CandleBar` input)
