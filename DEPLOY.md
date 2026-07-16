# TradeMind AI — Deploy the **real** FastAPI backend (free cloud)

This guide deploys the **production FastAPI engines + Neon Postgres**, with the
Trading Terminal and Replay Studio on Vercel.

> **Official path:** FastAPI + Neon + Vercel only.  
> Do **not** deploy or run `demo-server/` for TradeMind testing.


---

## What gets deployed (and why)

| Service | Platform | Why |
| --- | --- | --- |
| **FastAPI (`app/`)** | Render or Railway | Real Market Structure, Order Blocks, FVG, Liquidity Sweeps, Trade Setups, Strategy, Replay Studio, Validation |
| **PostgreSQL** | [Neon](https://neon.tech) free tier | Persists candles + analysis results (required by FastAPI) |
| **Trading Terminal** | Vercel | Static React app → calls `VITE_API_BASE` |
| **Replay Studio** | Vercel (2nd project) | Same |

**Decision Engine (WAIT / BUY / SELL)** runs in the **Terminal frontend**
(`terminal/src/lib/decision.ts`). It consumes FastAPI trend/setups/SMC data —
there is no separate Decision microservice.

**Not deployed:** `demo-server/` (Node in-memory substitute used only for local
PC launch without Python).

---

## Architecture

```
iPhone Safari
    │
    ▼
Vercel  ── Trading Terminal / Replay Studio
    │         VITE_API_BASE=https://api…/api/v1
    ▼
Render/Railway  ── FastAPI (uvicorn)
    │
    ▼
Neon PostgreSQL  ── candles, symbols, analysis, setups
```

---

## Step 1 — Neon database

1. Create a project at https://neon.tech  
2. Copy the **direct** connection string (not the pooler, for migrations):

```
postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

---

## Step 2 — Deploy FastAPI (Render)

1. Push this repo to GitHub.  
2. Render → **New Web Service** → connect repo.  
3. Settings:

| Field | Value |
| --- | --- |
| Root Directory | *(leave empty — repo root)* |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `bash scripts/start_api.sh` |
| Health Check | `/api/v1/health` |

4. Environment variables:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Neon URI from Step 1 |
| `APP_ENV` | `production` |
| `DEBUG` | `false` |
| `CORS_ORIGINS` | *(set after Vercel — Step 4)* |
| `LOG_FORMAT` | `text` |

5. Deploy. Open `https://YOUR-API.onrender.com/api/v1/health` — expect healthy DB.

**Railway alternative:** New project from GitHub, root = repo root, uses
`Dockerfile` + `scripts/start_api.sh`. Set the same env vars.

> Free tiers sleep when idle. First request after sleep can take 30–60s.

---

## Step 3 — Bootstrap market data + engines (once)

From your PC (Python 3.12+ with `httpx`):

```powershell
cd "D:\TradeMind AI"
pip install httpx
$env:TRADEMIND_API_BASE="https://YOUR-API.onrender.com/api/v1"
python scripts/bootstrap_market.py
```

This syncs Binance symbols, downloads candles (BTC/ETH/SOL), and runs:

- Analysis plugins (EMA/SMA/VWAP/RSI/MACD/ATR + SMC plugins)
- Market Structure / Order Blocks / FVG / Liquidity Sweeps
- Trade Setup Engine

Re-run periodically (or after Neon sleep wipe) to refresh data.

---

## Step 4 — Deploy frontends (Vercel)

### Trading Terminal

- Root Directory: `terminal`
- Env: `VITE_API_BASE=https://YOUR-API.onrender.com/api/v1`

### Replay Studio

- Root Directory: `studio`
- Env:
  - `VITE_API_BASE=https://YOUR-API.onrender.com/api/v1`
  - `VITE_BASE=/`

### CORS

On the API, set:

```
CORS_ORIGINS=https://YOUR-TERMINAL.vercel.app,https://YOUR-STUDIO.vercel.app
```

Redeploy/restart the API. FastAPI also allows `https://*.vercel.app` via regex.

---

## Step 5 — iPhone

1. Safari → Terminal Vercel URL  
2. Login: `demo@trademind.ai` / `demo123`  
3. Open Markets / chart — data comes from **FastAPI + Neon**, not demo-server  

PC can be off.

---

## Env cheat sheet

See [`.env.production.example`](./.env.production.example).

| Where | Variable |
| --- | --- |
| Neon / API | `DATABASE_URL` |
| API | `CORS_ORIGINS`, `APP_ENV=production` |
| Vercel apps | `VITE_API_BASE=https://…/api/v1` |
| Studio only | `VITE_BASE=/` |

No `localhost` in production `VITE_API_BASE`.

---

## Local: run real FastAPI (optional)

```powershell
copy .env.example .env
# set DATABASE_URL to Neon, or use docker compose for local Postgres
docker compose up --build
$env:TRADEMIND_API_BASE="http://127.0.0.1:8000/api/v1"
python scripts/bootstrap_market.py
cd terminal
$env:VITE_API_BASE="http://127.0.0.1:8000/api/v1"
npm run dev
```

---

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Empty Markets / 404 trend | Run `bootstrap_market.py` |
| Quote bar empty | Need 15m + 1d candles downloaded for that symbol |
| CORS blocked | Exact Vercel HTTPS origins in `CORS_ORIGINS` |
| DB connection failed | Use Neon **direct** URL + `sslmode=require` |
| Cold start 502 | Wait ~1 min on Render free, retry |

---

## Files

| File | Role |
| --- | --- |
| `Dockerfile` | FastAPI image |
| `scripts/start_api.sh` | migrate + uvicorn |
| `scripts/bootstrap_market.py` | seed candles + run engines |
| `render.yaml` / `railway.toml` | cloud blueprints |
| `terminal/vercel.json` / `studio/vercel.json` | SPA hosting |
| `app/api/v1/endpoints/quotes.py` | Terminal `/quotes` + debug routes |
