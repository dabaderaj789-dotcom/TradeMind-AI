# TradeMind AI — Launch Locally (FastAPI)

Official runtime (no Node demo-server):

```
React Terminal / Replay Studio
        ↓
     FastAPI
        ↓
   PostgreSQL
        ↓
 Market adapters (Binance / NSE)
```

## The single command

```
.\launch_trademind.bat
```

Or: `node launch.mjs`

**Requires Docker Desktop** (starts Postgres + FastAPI) and **Node.js 18+** (Terminal + Studio).

What the launcher does:

1. `docker compose up -d --build` (API + DB, migrations)
2. Bootstraps BTC/ETH/SOL (sync → candles → engines → strategies)
3. Starts Trading Terminal (`:5175`) and Replay Studio (`:5173`)
4. Opens the browser

Press **Ctrl+C** to stop the frontends. API/DB keep running unless you set `TRADEMIND_STOP_DOCKER=1` or run `docker compose stop`.

Skip bootstrap: `set TRADEMIND_SKIP_BOOTSTRAP=1` then launch.

## URLs

| Service | URL |
| --- | --- |
| Trading Terminal | http://127.0.0.1:5175 (or LAN IP from launcher) |
| Replay Studio | http://127.0.0.1:5173/studio/ |
| API health | http://127.0.0.1:8000/api/v1/health |
| API docs | http://127.0.0.1:8000/docs |

## Session login

`demo@trademind.ai` / `demo123` — **local UI gate only**. FastAPI has no JWT yet.

## Manual bootstrap

```
pip install httpx
python scripts/bootstrap_market.py
```

## Cloud deploy

See [DEPLOY.md](./DEPLOY.md) (FastAPI + Neon + Vercel).

## Verification

See [VERIFICATION.md](./VERIFICATION.md).

## Deprecated

`demo-server/` is **not** started by the launcher. Keep it only for historical reference; do not point production Terminal traffic at it.
