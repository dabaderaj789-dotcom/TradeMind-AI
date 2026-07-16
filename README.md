# TradeMind AI

Production-grade AI trading platform backend built with **FastAPI**, **SQLAlchemy 2.x**, and **PostgreSQL**.

## Architecture

```
app/
├── adapters/      # Exchange adapters (Binance, future NSE/Bybit)
├── api/           # HTTP layer — routes, dependency injection
├── config/        # Environment-based configuration (Pydantic Settings)
├── core/          # Cross-cutting concerns — logging, exceptions
├── database/      # Engine, session factory, declarative base
├── domain/        # Pure domain entities and value objects
├── models/        # SQLAlchemy ORM models
├── engines/       # Analysis engine and future computation engines
├── pipeline/      # Candle validation and bulk persistence
├── repositories/  # Data access layer (repository pattern)
├── schemas/       # Pydantic request/response schemas
├── services/      # Business logic layer
└── utils/         # Shared helpers
```

Clean architecture enforces a strict dependency direction:

**API → Services → Engines / Repositories → Models**

Future modules (Indicators, Smart Money, AI Engine, Backtesting, Alerts, Risk Management) plug in by adding models, repositories, services, and endpoint routers without changing existing layers.

## Prerequisites

- Python 3.12+
- Docker & Docker Compose (recommended)
- PostgreSQL 16 (if running locally without Docker)

## Quick Start (Docker)

1. **Clone and configure**

   ```bash
   cp .env.example .env
   ```

2. **Start services**

   ```bash
   docker compose up --build
   ```

   This starts PostgreSQL, runs Alembic migrations, and launches the API on port 8000.

3. **Verify**

   ```bash
   curl http://localhost:8000/api/v1/health
   ```

   Open interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs).

## Documentation

Full Sprint 2 architecture and design docs are in [`docs/`](docs/README.md):

- [System Architecture](docs/architecture/overview.md)
- [Database Schema](docs/database/schema-design.md)
- [API Design](docs/api/endpoints.md)
- [Roadmap](docs/roadmap/overview.md)

- [Roadmap](docs/roadmap/overview.md)
- [Market Data API (Sprint 3)](docs/api/market-data.md)

## Market Data Engine (Sprint 3)

The Market Data Engine ingests historical OHLCV data from exchange adapters, validates and normalizes candles, and stores them idempotently in PostgreSQL.

**Phase 1:** Binance Spot (USDT pairs). Architecture supports adding NSE, Bybit, and Forex via the `ExchangeAdapter` interface.

### Quick workflow

```bash
# 1. Sync symbols from Binance
curl -X POST http://localhost:8000/api/v1/symbols/sync \
  -H "Content-Type: application/json" \
  -d '{"exchange_code": "binance"}'

# 2. Download historical candles (incremental from latest stored bar)
curl -X POST http://localhost:8000/api/v1/candles/download \
  -H "Content-Type: application/json" \
  -d '{
    "exchange_code": "binance",
    "symbol_code": "BTCUSDT",
    "timeframe": "1h",
    "incremental": true
  }'

# 3. Retrieve stored candles (use symbol_id from /symbols)
curl "http://localhost:8000/api/v1/candles/{symbol_id}?timeframe=1h&limit=100"
```

See [Market Data API docs](docs/api/market-data.md) for full examples.

## Analysis Engine (Sprint 4)

Plugin-based analysis framework. Phase 1 includes EMA, SMA, RSI, MACD, ATR, Bollinger Bands, VWAP, and OBV.

```bash
# List plugins
curl http://localhost:8000/api/v1/analysis/plugins

# Execute RSI + MACD on stored candles
curl -X POST http://localhost:8000/api/v1/analysis/execute \
  -H "Content-Type: application/json" \
  -d '{
    "symbol_id": "YOUR_SYMBOL_UUID",
    "timeframe": "1h",
    "plugins": [
      {"plugin_id": "rsi", "parameters": {"period": 14}},
      {"plugin_id": "macd"}
    ]
  }'

# Retrieve stored results
curl "http://localhost:8000/api/v1/analysis/results/YOUR_SYMBOL_UUID?timeframe=1h&plugin_id=rsi"
```

See [Analysis Engine docs](docs/analysis/overview.md).

## Market Structure Engine (Sprint 5)

Structure analysis plugin: swings (HH/HL/LH/LL), trend, BOS, CHoCH, market phase, dynamic support/resistance.

```bash
curl -X POST http://localhost:8000/api/v1/market-structure/execute \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": "YOUR_SYMBOL_UUID", "timeframe": "1h"}'

curl "http://localhost:8000/api/v1/market-structure/trend/YOUR_SYMBOL_UUID?timeframe=1h"
```

See [Market Structure docs](docs/market-structure/overview.md).

## Order Blocks (Sprint 6A)

Institutional order block detection from confirmed Market Structure BOS events, with mitigation, invalidation, and strength scoring.

```bash
curl -X POST http://localhost:8000/api/v1/order-blocks/execute \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": "YOUR_SYMBOL_UUID", "timeframe": "1h"}'

curl "http://localhost:8000/api/v1/order-blocks/active/YOUR_SYMBOL_UUID?timeframe=1h"
```

See [Order Blocks docs](docs/order-blocks/overview.md).

## Fair Value Gaps (Sprint 6B)

Three-candle fair value gap detection with quality scoring, fill tracking, and Market Structure / Order Block context.

```bash
curl -X POST http://localhost:8000/api/v1/fair-value-gaps/execute \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": "YOUR_SYMBOL_UUID", "timeframe": "1h"}'

curl "http://localhost:8000/api/v1/fair-value-gaps/active/YOUR_SYMBOL_UUID?timeframe=1h"
```

See [Fair Value Gaps docs](docs/fair-value-gaps/overview.md).

## Liquidity Sweeps (Sprint 6C)

Buy-side and sell-side liquidity sweep detection with confirmation scoring and SMC context.

```bash
curl -X POST http://localhost:8000/api/v1/liquidity-sweeps/execute \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": "YOUR_SYMBOL_UUID", "timeframe": "1h"}'

curl "http://localhost:8000/api/v1/liquidity-sweeps/active/YOUR_SYMBOL_UUID?timeframe=1h"
```

See [Liquidity Sweeps docs](docs/liquidity-sweeps/overview.md).

## Trade Setup Engine (Sprint 7)

Evidence-based institutional setup detection from Market Structure, Order Blocks, FVGs, Liquidity Sweeps, and indicators. Does not generate buy/sell signals.

```bash
curl -X POST http://localhost:8000/api/v1/trade-setups/execute \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": "YOUR_SYMBOL_UUID", "timeframe": "1h"}'

curl "http://localhost:8000/api/v1/trade-setups/active/YOUR_SYMBOL_UUID?timeframe=1h&min_confidence=70"
```

See [Trade Setups docs](docs/trade-setups/overview.md).

## Strategy & Backtesting (Sprint 8)

Strategy plugins evaluate trade setups and generate trade plans. The backtesting engine replays plans over historical candles with full performance analytics.

```bash
curl http://localhost:8000/api/v1/strategies

curl -X POST http://localhost:8000/api/v1/strategies/execute \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": "YOUR_SYMBOL_UUID", "timeframe": "1h", "strategy_id": "trend_continuation"}'

curl -X POST http://localhost:8000/api/v1/backtests/start \
  -H "Content-Type: application/json" \
  -d '{"symbol_id": "YOUR_SYMBOL_UUID", "timeframe": "1h", "strategy_id": "trend_continuation"}'
```

See [Strategy & Backtesting docs](docs/strategy-backtest/overview.md).

## Validation & Replay Studio (Sprint 9)

Internal engineering tool for candle-by-candle replay and engine validation.

```bash
# API
uvicorn app.main:app --reload

# Studio UI (separate terminal)
cd studio && npm install && npm run dev
```

Open http://localhost:5173 — or http://localhost:8000/studio after `npm run build`.

See [Replay Studio docs](docs/replay-studio/overview.md).

## Validation Toolkit

Review trade setups in Replay Studio (Correct / Incorrect / Unsure), export CSV, and view quality dashboards.

See [Validation Toolkit docs](docs/validation/overview.md).

## Local Development (without Docker)

1. **Create virtual environment**

   ```bash
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   # source .venv/bin/activate   # macOS/Linux
   pip install -r requirements.txt
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Ensure PostgreSQL is running and credentials in `.env` match your local instance.

3. **Run migrations**

   ```bash
   alembic upgrade head
   ```

4. **Start the server**

   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Running Tests

```bash
pytest -v
pytest --cov=app --cov-report=term-missing
```

## API Endpoints

| Method | Path                              | Description                          |
|--------|-----------------------------------|--------------------------------------|
| GET    | `/`                               | Root — app info and links            |
| GET    | `/api/v1/health`                  | Health check with DB probe           |
| GET    | `/api/v1/exchanges`               | List exchanges                       |
| GET    | `/api/v1/symbols`                 | List symbols                         |
| POST   | `/api/v1/symbols/sync`            | Sync symbols from exchange           |
| POST   | `/api/v1/candles/download`        | Download historical candles          |
| GET    | `/api/v1/candles/{symbol_id}`     | Retrieve stored candles              |
| GET    | `/api/v1/candles/{symbol_id}/latest` | Latest N candles                  |
| GET    | `/api/v1/analysis/plugins`        | List analysis plugins                |
| POST   | `/api/v1/analysis/execute`        | Execute analysis on stored candles   |
| GET    | `/api/v1/analysis/results/{symbol_id}` | Retrieve analysis results       |
| POST   | `/api/v1/market-structure/execute` | Run market structure analysis      |
| GET    | `/api/v1/market-structure/trend/{symbol_id}` | Current trend              |
| GET    | `/api/v1/market-structure/levels/{symbol_id}` | Support/resistance      |
| GET    | `/api/v1/market-structure/events/{symbol_id}` | BOS/CHoCH history         |
| GET    | `/docs`                           | Swagger UI (non-production only)     |

## Database Migrations

```bash
# Create a new migration after model changes
alembic revision --autogenerate -m "describe change"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

## Environment Variables

See [`.env.example`](.env.example) for all available settings. Key variables:

| Variable           | Default              | Description                    |
|--------------------|----------------------|--------------------------------|
| `APP_ENV`          | `development`        | `development` / `staging` / `production` |
| `POSTGRES_HOST`    | `localhost`          | Database host                  |
| `POSTGRES_DB`      | `trademind_db`       | Database name                  |
| `CORS_ORIGINS`     | `http://localhost:3000,...` | Comma-separated allowed origins |
| `LOG_LEVEL`        | `INFO`               | Loguru log level               |
| `LOG_FORMAT`       | `json`               | `json` or `text`               |

## Project Structure Details

| Folder            | Responsibility                                              |
|-------------------|-------------------------------------------------------------|
| `app/adapters/`   | Exchange adapter interface + Binance implementation         |
| `app/api/`        | FastAPI routers, endpoint handlers, dependency injection    |
| `app/domain/`     | Pure domain entities (Candle, Symbol, Timeframe)            |
| `app/engines/analysis/` | Plugin-based analysis engine (indicators, future SMC/AI) |
| `app/pipeline/`   | Candle validation and bulk idempotent writes                |
| `app/config/`     | Pydantic Settings loaded from `.env`                        |
| `app/core/`       | Logging setup, global exception handlers                    |
| `app/database/`   | Async engine, session lifecycle, SQLAlchemy `Base`          |
| `app/models/`     | ORM entity definitions                                      |
| `app/schemas/`    | Pydantic models for API validation and serialization        |
| `app/repositories/` | Generic and domain-specific data access                   |
| `app/services/`   | Business logic orchestration                                |
| `app/utils/`      | Pure helper functions                                       |
| `alembic/`        | Database migration scripts                                  |
| `tests/`          | Pytest test suite with async client fixtures                |

## License

MIT
