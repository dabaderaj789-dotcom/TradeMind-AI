# Validation & Replay Studio — Sprint 9

Internal engineering tool for candle-by-candle validation of all TradeMind AI engines.

**Not** the customer dashboard.

## Architecture

```
Browser (Replay Studio UI)
    ↓ REST
Replay Studio API (/api/v1/replay-studio)
    ↓
ReplayStudioService → ReplayStudioEngine
    ↓
Candles + analysis_results + trade_setups + trade_plans (DB)
```

### No Future Reveal

All historical data is loaded **server-side** into a replay session. The client only receives candles and overlays up to `current_index`. Stepping forward reveals one bar at a time — future data never leaves the server until the replay index reaches it.

## Replay Lifecycle

1. **Create session** — `POST /replay-studio/sessions` loads candles, plugin results, setups, and strategy plans
2. **Frame** — `GET /replay-studio/sessions/{id}/frame` returns visible candles + overlays
3. **Step / Jump** — advance or scrub the replay index
4. **Inspector** — per-candle breakdown of all engine outputs
5. **Events** — unified log of BOS, CHoCH, OB, FVG, sweeps, setups, strategy decisions
6. **Debug** — raw JSON plugin payloads and execution order

## Overlay System

Overlays are built from persisted `analysis_results` at each bar ≤ `current_index`:

| Overlay | Source Plugin |
|---------|---------------|
| EMA, SMA, RSI, MACD, ATR, VWAP | Indicator plugins |
| Market Structure | `market_structure` — swings, BOS, CHoCH, S/R |
| Order Blocks | `order_blocks` — active zones at current bar |
| Fair Value Gaps | `fair_value_gaps` |
| Liquidity Sweeps | `liquidity_sweeps` |
| Trade Setups | `trade_setups` table |
| Strategy Decisions | `trade_plans` table |

Pass `?overlays=ema,market_structure` to filter frame overlays.

## Event System

Events are extracted once at session creation from:

- Market structure BOS / CHoCH / swing points
- New order blocks, FVGs, liquidity sweeps
- Trade setup detections
- Strategy trade plan generations

Clicking an event jumps replay to that bar index.

## Debug Mode

Enable via `PATCH /replay-studio/sessions/{id}/settings` with `{ "debug_mode": true }`.

Returns:

- Plugin execution order
- Raw per-plugin JSON at current bar
- Parameter hashes used

## Performance Metrics

`GET /replay-studio/sessions/{id}/metrics` reports:

- Plugin load timings
- DB query time
- Memory estimate
- Cache hits/misses
- Suggested tick interval for playback speed

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/replay-studio/sessions` | Create replay session |
| GET | `/replay-studio/sessions/{id}` | Session state |
| GET | `/replay-studio/sessions/{id}/frame` | Current visible frame |
| POST | `/replay-studio/sessions/{id}/step-forward` | Step forward N candles |
| POST | `/replay-studio/sessions/{id}/step-back` | Step back N candles |
| POST | `/replay-studio/sessions/{id}/jump` | Jump to index or date |
| POST | `/replay-studio/sessions/{id}/jump-event` | Jump to event |
| POST | `/replay-studio/sessions/{id}/playback` | Play / pause + speed |
| PATCH | `/replay-studio/sessions/{id}/settings` | Debug mode |
| GET | `/replay-studio/sessions/{id}/inspector` | Inspector panel |
| GET | `/replay-studio/sessions/{id}/events` | Event log |
| GET | `/replay-studio/sessions/{id}/debug` | Debug payloads |
| GET | `/replay-studio/sessions/{id}/metrics` | Performance metrics |
| DELETE | `/replay-studio/sessions/{id}` | End session |

## Validation Workflow

1. Download candles for a symbol/timeframe
2. Run analysis plugins (`POST /analysis/execute`)
3. Run trade setup detection
4. Optionally run strategy execute
5. Open Replay Studio
6. Step through history and verify overlays match expectations
7. Use inspector + debug mode to inspect raw plugin output
8. Click events to validate timing of detections

## Running the Studio

### Development (recommended)

```bash
# Terminal 1 — API
uvicorn app.main:app --reload

# Terminal 2 — Studio UI
cd studio
npm install
npm run dev
```

Open http://localhost:5173 (proxies `/api` to port 8000).

### Production build

```bash
cd studio && npm run build
```

Built assets in `studio/dist` are served at http://localhost:8000/studio when present.

## Tests

```bash
pytest tests/unit/test_replay_studio.py tests/api/test_replay_studio_api.py -v
```
