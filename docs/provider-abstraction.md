# Provider Abstraction Layer

TradeMind chart tip, option chain, and AI never talk to Angel / Upstox / Dhan / etc. directly.

```
Chart / OptionChain / Accuracy
            │
            ▼
    MarketEngineService
            │
            ▼
    ProviderRegistry  (roles: india | crypto | option_chain)
            │
            ▼
    MarketDataProvider  (common interface)
            │
    ┌───────┼───────────────┬──────────┬─────────┐
    ▼       ▼               ▼          ▼         ▼
 yahoo_nse binance   angel (LTP+orders)  upstox/dhan/zerodha  truedata/gfdl
 (live)    (live)    see angel-trading.md (stubs)             (stubs)
```

## Normalized contracts

- `NormalizedTick` — last, volume, bid/ask, OI, market status
- `NormalizedOHLC` — OHLCV + optional OI
- `NormalizedOptionChain` / leg / Greeks
- `InstrumentMetadata`

## Switch provider (no app logic change)

```env
MARKET_DATA_INDIA_PROVIDER=yahoo_nse   # or angel | upstox | dhan | …
MARKET_DATA_CRYPTO_PROVIDER=binance
MARKET_DATA_OPTION_CHAIN_PROVIDER=yahoo_nse
```

Inspect: `GET /api/v1/market-engine/providers`

## Note

`app/adapters/*` remains the **historical candle download** path (Binance/NSE/Forex → Postgres).
`app/providers/*` is the **live market-data** path (ticks, option chain, streaming-ready).
