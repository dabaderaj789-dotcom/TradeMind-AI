# TradeMind AI — FastAPI Integration Verification Checklist

Use this after `.\launch_trademind.bat` (FastAPI + Docker) or a cloud deploy.

**Rule:** Every market/analysis payload must come from FastAPI. No `demo-server`, no mocked SMC, no random prices.

---

## Pre-flight

| Check | How |
| --- | --- |
| ☐ Docker running | `docker compose ps` shows `trademind-api` + `trademind-postgres` |
| ☐ API healthy | `GET http://127.0.0.1:8000/api/v1/health` → `healthy` |
| ☐ Not demo-server | Health JSON should reference FastAPI / DB services (not `demo-data`) |
| ☐ Bootstrap done | Launcher ran pipeline, or `python scripts/bootstrap_market.py` |
| ☐ Terminal proxy | Devtools Network: requests to `/api/v1/...` only |

---

## Per-screen checklist

### Login
| | |
| --- | --- |
| ☐ | UI session gate works |
| ☐ | No call to demo-server |
| ⚠ | FastAPI JWT auth **not implemented** — local session only (blocker) |

### Markets
| | |
| --- | --- |
| ☐ | Symbol tree / search loads from `GET /symbols` |
| ☐ | Selecting a symbol opens Terminal with that `symbol_id` |
| ☐ | No hardcoded ticker lists in UI |

### Scanner
| | |
| --- | --- |
| ☐ | Rows from `GET /symbols` + `GET /trade-setups/active/...` + `GET /market-structure/trend/...` |
| ☐ | Empty universe → empty table (not fake setups) |

### Watchlist
| | |
| --- | --- |
| ☐ | List is local prefs (UX) — **not** market analysis |
| ⚠ | Server-side watchlist API **not implemented** (blocker for multi-device sync) |

### Morning Brief (Home)
| | |
| --- | --- |
| ☐ | Outlook / opportunities from FastAPI symbols + trend + setups |
| ☐ | High Impact News from `GET /calendar/events` (may be empty — never client-fabricated) |
| ☐ | No demo calendar pool |

### Trading Terminal — Chart
| | |
| --- | --- |
| ☐ | Candles from `GET /candles/{id}/latest` |
| ☐ | Chart renders OHLC |
| ☐ | Quote bar from `GET /quotes/{id}` |
| ☐ | Live chip uses `fastapi-quotes` poller (not demo-stream) |

### Trading Terminal — Analysis
| | |
| --- | --- |
| ☐ | Trend / levels / events from `/market-structure/...` |
| ☐ | Order Blocks from `/order-blocks/active/...` |
| ☐ | FVG from `/fair-value-gaps/active/...` |
| ☐ | Sweeps from `/liquidity-sweeps/active/...` |
| ☐ | Setups from `/trade-setups/active/...` |
| ☐ | Strategies from `/strategies` (+ detail) |
| ☐ | Indicators from `/analysis/results/...` |

### Decision Engine
| | |
| --- | --- |
| ☐ | WAIT / BUY / SELL computed in browser from **API inputs only** |
| ☐ | With empty FastAPI analysis → WAIT (not invented BUY/SELL) |

### Bottom panel — Performance / Trade History
| | |
| --- | --- |
| ☐ | Backtest runs hit `/backtests/...` |
| ☐ | Live journal is client-side outcome tracking (not fabricated markets) |
| ⚠ | Server-persisted trade journal API **not implemented** |

### Replay Studio
| | |
| --- | --- |
| ☐ | Sessions via `/replay-studio/...` on FastAPI |
| ☐ | Charts / inspector populate after bootstrap candles |

### Validation Toolkit
| | |
| --- | --- |
| ☐ | Uses `/validation/...` on FastAPI |

---

## Network proof (DevTools)

Filter: `demo-server` → **0 hits**  
Filter: `/api/v1/` → all Terminal market traffic  

Sample must-hit endpoints after opening BTCUSDT 1h:

- `/api/v1/health`
- `/api/v1/candles/{uuid}/latest?timeframe=1h`
- `/api/v1/quotes/{uuid}`
- `/api/v1/market-structure/trend/{uuid}`
- `/api/v1/order-blocks/active/{uuid}`
- `/api/v1/fair-value-gaps/active/{uuid}`
- `/api/v1/liquidity-sweeps/active/{uuid}`
- `/api/v1/trade-setups/active/{uuid}`

---

## Fail closed

If FastAPI has no persisted analysis for a symbol:

- Panels empty or error toast  
- Decision = **WAIT**  
- **Never** invent OB/FVG/setups client-side  
