# REST API Design

> Base URL: `/api/v1`  
> Authentication: Bearer JWT (except public endpoints)  
> Content-Type: `application/json`  
> **Not implemented** — design specification only

---

## Conventions

| Convention | Standard |
|------------|----------|
| Pagination | `?page=1&page_size=50` → `{items, total, page, page_size, pages}` |
| Sorting | `?sort=-created_at` (prefix `-` for descending) |
| Filtering | Query params per resource |
| Errors | `{success: false, error, detail, status_code}` |
| Timestamps | ISO 8601 UTC |
| IDs | UUID v4 |

---

## 1. Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Application and dependency health |

---

## 2. Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Login, returns JWT pair |
| POST | `/auth/refresh` | Refresh token | Rotate access token |
| POST | `/auth/logout` | Yes | Invalidate session |
| POST | `/auth/forgot-password` | No | Send reset email |
| POST | `/auth/reset-password` | No | Reset with token |
| GET | `/auth/me` | Yes | Current user profile |

**POST `/auth/register` body:** `{email, password, full_name}`  
**POST `/auth/login` body:** `{email, password}`  
**Response:** `{access_token, refresh_token, user}`

---

## 3. Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | Yes | Get own profile |
| PATCH | `/users/me` | Yes | Update profile |
| PATCH | `/users/me/password` | Yes | Change password |
| PATCH | `/users/me/preferences` | Yes | Update preferences |
| GET | `/users/me/subscription` | Yes | Subscription tier |

**Admin:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | Admin | List users |
| GET | `/users/{user_id}` | Admin | Get user |
| PATCH | `/users/{user_id}` | Admin | Update user |
| DELETE | `/users/{user_id}` | Admin | Deactivate user |

---

## 4. Exchanges & Markets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/exchanges` | Yes | List exchanges |
| GET | `/exchanges/{code}` | Yes | Exchange detail |
| GET | `/exchanges/{code}/health` | Yes | Adapter health |
| GET | `/markets` | Yes | List markets |
| GET | `/markets/{code}` | Yes | Market detail |
| GET | `/exchanges/{code}/sessions` | Yes | Sessions & holidays |

---

## 5. Symbols

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/symbols` | Yes | List symbols (paginated) |
| GET | `/symbols/search` | Yes | Search by name/ticker |
| GET | `/symbols/{symbol_id}` | Yes | Symbol detail |
| GET | `/symbols/by-code/{exchange_code}/{symbol_code}` | Yes | Lookup by ticker |

**Query params:** `exchange_code`, `market_type`, `sector`, `is_active`, `page`, `page_size`

**Admin:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/symbols/sync` | Admin | Sync from adapters |
| PATCH | `/symbols/{symbol_id}` | Admin | Update metadata |

---

## 6. Candles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/candles/{symbol_id}` | Yes | OHLCV candles |
| GET | `/candles/{symbol_id}/latest` | Yes | Latest N candles |
| GET | `/candles/{symbol_id}/range` | Yes | Date range |

**Query:** `timeframe` (required), `start`, `end`, `limit`

**Admin:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/candles/sync` | Admin | Historical sync |
| POST | `/candles/gap-fill` | Admin | Fill gaps |
| GET | `/candles/gaps` | Admin | List gaps |

---

## 7. Indicators

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/indicators` | Yes | List definitions |
| GET | `/indicators/{code}` | Yes | Detail + param schema |
| GET | `/indicators/values/{symbol_id}` | Yes | Computed values |
| POST | `/indicators/compute` | Yes | On-demand compute |
| POST | `/indicators/compute/batch` | Yes | Batch compute |

**POST `/indicators/compute` body:** `{symbol_id, timeframe, indicator_code, parameters}`

---

## 8. Smart Money Concepts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/smart-money/{symbol_id}` | Yes | Full SMC analysis |
| GET | `/smart-money/{symbol_id}/order-blocks` | Yes | Order blocks |
| GET | `/smart-money/{symbol_id}/liquidity` | Yes | Liquidity zones |
| GET | `/smart-money/{symbol_id}/structure` | Yes | BOS / CHoCH |
| GET | `/smart-money/{symbol_id}/fvg` | Yes | Fair value gaps |
| POST | `/smart-money/analyze` | Yes | On-demand analysis |

**Query:** `timeframe`, `start`, `end`, `limit`

---

## 9. Strategies

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/strategies` | Yes | User's strategies |
| GET | `/strategies/public` | Yes | Community strategies |
| GET | `/strategies/available` | Yes | Plugin types |
| POST | `/strategies` | Yes | Create strategy |
| GET | `/strategies/{strategy_id}` | Yes | Detail |
| PATCH | `/strategies/{strategy_id}` | Yes | Update metadata |
| DELETE | `/strategies/{strategy_id}` | Yes | Delete |
| GET | `/strategies/{strategy_id}/versions` | Yes | Version history |
| POST | `/strategies/{strategy_id}/versions` | Yes | New version |
| POST | `/strategies/{strategy_id}/evaluate` | Yes | Evaluate now |

**POST `/strategies` body:** `{code, name, description, parameters, timeframes, symbols_filter?}`

---

## 10. Signals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/signals` | Yes | List signals |
| GET | `/signals/active` | Yes | Active only |
| GET | `/signals/{signal_id}` | Yes | Detail |
| GET | `/signals/by-symbol/{symbol_id}` | Yes | By symbol |
| PATCH | `/signals/{signal_id}/status` | Yes | Cancel / update |

**Query:** `direction`, `strength`, `strategy_id`, `symbol_id`, `timeframe`, `start`, `end`

---

## 11. Backtests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/backtests` | Yes | List backtests |
| POST | `/backtests` | Yes | Start backtest (async 202) |
| GET | `/backtests/{backtest_id}` | Yes | Status + config |
| DELETE | `/backtests/{backtest_id}` | Yes | Cancel / delete |
| GET | `/backtests/{backtest_id}/results` | Yes | Metrics summary |
| GET | `/backtests/{backtest_id}/trades` | Yes | Simulated trades |
| GET | `/backtests/{backtest_id}/equity-curve` | Yes | Equity curve |

**POST `/backtests` body:**
```json
{
  "strategy_version_id": "uuid",
  "name": "RELIANCE 1h test",
  "start_date": "2024-01-01",
  "end_date": "2025-01-01",
  "initial_capital": 100000,
  "symbols": ["uuid"],
  "timeframes": ["1h"],
  "commission_rate": 0.001,
  "slippage_rate": 0.0005
}
```

---

## 12. Paper Trading

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/paper-trading/orders` | Yes | List orders |
| POST | `/paper-trading/orders` | Yes | Place order |
| DELETE | `/paper-trading/orders/{order_id}` | Yes | Cancel |
| GET | `/paper-trading/positions` | Yes | Open positions |
| POST | `/paper-trading/positions/{position_id}/close` | Yes | Close position |
| GET | `/paper-trading/history` | Yes | Trade history |

---

## 13. AI Engine

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/ai/models` | Yes | List models |
| GET | `/ai/models/available` | Yes | Plugin types |
| POST | `/ai/models` | Yes | Create model config |
| GET | `/ai/models/{model_id}` | Yes | Detail |
| PATCH | `/ai/models/{model_id}` | Yes | Update config |
| POST | `/ai/models/{model_id}/train` | Yes | Start training (async) |
| POST | `/ai/models/{model_id}/activate` | Yes | Activate for inference |
| POST | `/ai/models/{model_id}/deactivate` | Yes | Deactivate |
| POST | `/ai/predict` | Yes | Run inference |
| GET | `/ai/predictions/{symbol_id}` | Yes | Prediction history |
| GET | `/ai/models/{model_id}/metrics` | Yes | Training metrics |

**POST `/ai/predict` body:** `{model_id, symbol_id, timeframe}`

---

## 14. Live Scanner

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/scanner/presets` | Yes | Built-in scan presets |
| POST | `/scanner/run` | Yes | Run scan (sync or async) |
| GET | `/scanner/results/{scan_id}` | Yes | Scan results |
| POST | `/scanner/saved` | Yes | Save scan criteria |
| GET | `/scanner/saved` | Yes | List saved scans |
| DELETE | `/scanner/saved/{scan_id}` | Yes | Delete saved scan |

**POST `/scanner/run` body:**
```json
{
  "exchange_code": "nse",
  "market_type": "equity",
  "timeframe": "1h",
  "filters": [
    {"type": "indicator", "code": "rsi", "params": {"period": 14}, "operator": "gt", "value": 70},
    {"type": "smc", "pattern": "order_block_bullish"}
  ],
  "sort_by": "volume",
  "limit": 50
}
```

---

## 15. Alerts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/alerts` | Yes | List alerts |
| POST | `/alerts` | Yes | Create alert |
| GET | `/alerts/{alert_id}` | Yes | Detail |
| PATCH | `/alerts/{alert_id}` | Yes | Update |
| DELETE | `/alerts/{alert_id}` | Yes | Delete |
| POST | `/alerts/{alert_id}/test` | Yes | Test fire alert |
| GET | `/alerts/history` | Yes | Trigger history |

**POST `/alerts` body:**
```json
{
  "name": "RELIANCE RSI oversold",
  "symbol_id": "uuid",
  "alert_type": "indicator",
  "condition": {"indicator": "rsi", "params": {"period": 14}, "operator": "lt", "value": 30},
  "channels": ["push", "email"],
  "cooldown_minutes": 60
}
```

---

## 16. Watchlists

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/watchlists` | Yes | List watchlists |
| POST | `/watchlists` | Yes | Create watchlist |
| GET | `/watchlists/{watchlist_id}` | Yes | Detail with symbols |
| PATCH | `/watchlists/{watchlist_id}` | Yes | Update name/description |
| DELETE | `/watchlists/{watchlist_id}` | Yes | Delete |
| POST | `/watchlists/{watchlist_id}/symbols` | Yes | Add symbol |
| DELETE | `/watchlists/{watchlist_id}/symbols/{symbol_id}` | Yes | Remove symbol |
| PATCH | `/watchlists/{watchlist_id}/symbols/reorder` | Yes | Reorder symbols |

---

## 17. Portfolios

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/portfolios` | Yes | List portfolios |
| POST | `/portfolios` | Yes | Create portfolio |
| GET | `/portfolios/{portfolio_id}` | Yes | Detail + summary |
| PATCH | `/portfolios/{portfolio_id}` | Yes | Update |
| DELETE | `/portfolios/{portfolio_id}` | Yes | Delete |
| GET | `/portfolios/{portfolio_id}/positions` | Yes | Open positions |
| GET | `/portfolios/{portfolio_id}/performance` | Yes | P&L, returns |
| GET | `/portfolios/{portfolio_id}/history` | Yes | Historical snapshots |

---

## 18. Risk Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/risk/rules` | Yes | User risk rules |
| POST | `/risk/rules` | Yes | Create rule |
| PATCH | `/risk/rules/{rule_id}` | Yes | Update |
| DELETE | `/risk/rules/{rule_id}` | Yes | Delete |
| POST | `/risk/check` | Yes | Pre-trade risk check |
| GET | `/risk/exposure` | Yes | Current exposure summary |

**POST `/risk/check` body:** `{symbol_id, side, quantity, entry_price}`  
**Response:** `{approved: bool, reasons: [], adjusted_quantity?}`

---

## 19. Market Context

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/economic-events` | Yes | Economic calendar |
| GET | `/economic-events/upcoming` | Yes | Next 7 days |
| GET | `/news` | Yes | News feed |
| GET | `/news/{news_id}` | Yes | News detail |
| GET | `/news/by-symbol/{symbol_id}` | Yes | Symbol-related news |

---

## 20. WebSocket Channels

| Channel | Path | Auth | Events |
|---------|------|------|--------|
| Ticks | `WS /ws/v1/ticks` | Yes | Real-time price ticks |
| Candles | `WS /ws/v1/candles` | Yes | Forming candle updates |
| Signals | `WS /ws/v1/signals` | Yes | New signals |
| Alerts | `WS /ws/v1/alerts` | Yes | Alert triggers |
| Scanner | `WS /ws/v1/scanner` | Yes | Live scan results |

**Subscribe message:** `{action: "subscribe", channels: ["ticks"], symbols: ["uuid"], timeframes: ["5m"]}`

---

## 21. Rate Limits

| Tier | REST | Window |
|------|--------|--------|
| Free | 60 req | 1 min |
| Pro | 300 req | 1 min |
| Enterprise | 1000 req | 1 min |
| WebSocket | 5 connections | per user |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 22. Endpoint Count Summary

| Domain | Endpoints |
|--------|-----------|
| Health | 1 |
| Auth | 7 |
| Users | 9 |
| Exchanges & Markets | 6 |
| Symbols | 6 |
| Candles | 6 |
| Indicators | 5 |
| Smart Money | 6 |
| Strategies | 10 |
| Signals | 5 |
| Backtests | 7 |
| Paper Trading | 6 |
| AI | 11 |
| Scanner | 6 |
| Alerts | 7 |
| Watchlists | 8 |
| Portfolios | 8 |
| Risk | 6 |
| Market Context | 5 |
| WebSocket | 5 |
| **Total** | **~120** |
