# Angel One — personal algo trading

TradeMind can use **Angel SmartAPI** for India LTP and (optionally) live orders.

## Safety defaults

| Setting | Default | Meaning |
|---------|---------|---------|
| `TRADING_MODE` | `paper` | Orders stay in memory — **not** sent to Angel |
| `TRADING_LIVE_ENABLED` | `false` | Live path locked even if mode=live |
| `TRADING_KILL_SWITCH` | `false` | Set `true` to block everything |
| `TRADING_MAX_QTY` | `50` | Hard qty cap per order |
| `TRADING_MAX_ORDERS_PER_DAY` | `20` | Daily cap |

Live Angel orders require **all** of:

1. Valid Angel credentials  
2. `TRADING_MODE=live`  
3. `TRADING_LIVE_ENABLED=true`  
4. Kill switch off  

## Credentials (Railway / `.env`)

```env
ANGEL_API_KEY=...
ANGEL_CLIENT_CODE=...
ANGEL_PASSWORD=....          # 4-digit PIN
ANGEL_TOTP_SECRET=...       # from SmartAPI TOTP QR

# Optional — use Angel as India tip feed
MARKET_DATA_INDIA_PROVIDER=angel

# Keep paper until you trust the flow
TRADING_MODE=paper
TRADING_LIVE_ENABLED=false
```

Create an app at [smartapi.angelone.in](https://smartapi.angelone.in/).

## API

- `GET /api/v1/trading/status` — mode, Angel ready?, kill switch  
- `POST /api/v1/trading/kill-switch` — `{ "enabled": true }`  
- `POST /api/v1/trading/orders` — place paper/live order  

Example paper order:

```json
{
  "symbol_code": "RELIANCE",
  "side": "BUY",
  "quantity": 1,
  "order_type": "MARKET",
  "product": "INTRADAY"
}
```

## What is not built yet

- Auto signal → order robot loop (session scheduler)  
- Angel WebSocket streaming ticks  
- Options chain / F&O strike selection via Angel  
- Position sync / auto square-off  

Next step after credentials work: paper-fire signals from the Decision card, then tiny live size with kill switch.
