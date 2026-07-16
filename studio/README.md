# TradeMind Replay Studio

Internal validation UI for TradeMind AI (Sprint 9).

## Quick Start

```bash
npm install
npm run dev
```

Requires the TradeMind API running at http://localhost:8000 with persisted candles and analysis results.

## Build for production

```bash
npm run build
```

Output is served by FastAPI at `/studio` when `dist/` exists.
