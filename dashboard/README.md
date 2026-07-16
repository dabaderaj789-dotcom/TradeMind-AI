# TradeMind AI — Dashboard (MVP v1.0)

The first user-facing dashboard for TradeMind AI. It presents the outputs of the
existing analysis engines through the public REST API. It is **read-only** with
respect to the engines and does not expose developer tooling (Replay Studio,
Validation Toolkit).

## Features

- **Login screen** — session gate (demo auth stored in `localStorage`; the API
  currently has no auth, so any credentials are accepted).
- **Symbol search** with live suggestions (`GET /symbols`).
- **Timeframe selector** (`1m · 5m · 15m · 1h · 4h · 1d · 1w`).
- **Live candlestick chart** (TradingView Lightweight Charts) with volume,
  support/resistance and order-block overlays.
- **Current trend** & **market-structure summary** (levels + BOS/CHoCH breaks).
- **Order Block**, **Fair Value Gap** and **Liquidity Sweep** panels.
- **Current trade setup** with confidence gauge, entry / stop / targets / R:R.
- **Strategy recommendation** derived from the matching strategy's latest plan.
- **Watchlist** (persisted locally) with last price.
- **Active opportunities** table aggregated across the watchlist.
- **Recent analysis history** (historical trade setups).
- **Manual refresh** button.

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · lightweight-charts v4.

## Getting started

```bash
cd dashboard
npm install
npm run dev
```

The dev server runs on <http://localhost:5174> and proxies `/api/*` to the
TradeMind backend so the browser never hits CORS. Point it at a different
backend with:

```bash
# PowerShell
$env:VITE_API_TARGET="http://localhost:8000"; npm run dev
```

Make sure the backend is running (`uvicorn app.main:app --reload` from the repo
root) before signing in.

## Build

```bash
npm run build     # type-check + production bundle in dist/
npm run preview   # preview the production build
```

For production, either serve `dist/` behind the same origin as the API, or set
`VITE_API_BASE` at build time to an absolute API base URL (default `/api/v1`).

## Notes on data availability

The SMC read endpoints (`/order-blocks/active`, `/fair-value-gaps/active`,
`/liquidity-sweeps/active`, `/trade-setups/active`, `/market-structure/*`) return
**persisted** results. A symbol/timeframe will only show data after the
corresponding analysis has been executed on the backend. Empty panels therefore
mean "no persisted analysis yet", not a frontend error.

## Project layout

```
dashboard/
├── src/
│   ├── components/     UI + feature panels
│   ├── context/        AuthContext
│   ├── hooks/          data-fetching hooks (symbol data, watchlist)
│   ├── lib/            api client, types, formatters
│   ├── App.tsx         dashboard composition
│   └── main.tsx        entry
└── vite.config.ts      dev server + /api proxy
```
