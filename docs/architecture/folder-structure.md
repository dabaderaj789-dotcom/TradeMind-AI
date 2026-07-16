# Folder Structure

Scalable layout for a platform expected to exceed **100,000 lines of code**. Organized by **domain** and **layer**, not by technical type alone.

```
TradeMind AI/
│
├── app/                              # Application root
│   ├── main.py                       # FastAPI entry point
│   ├── container.py                  # DI container (future: dependency-injector)
│   │
│   ├── api/                          # HTTP / WebSocket presentation layer
│   │   ├── deps.py                   # Shared FastAPI dependencies
│   │   ├── middleware/               # Auth, rate limiting, request ID
│   │   │   ├── auth.py
│   │   │   ├── rate_limit.py
│   │   │   └── request_context.py
│   │   ├── websocket/                # Real-time channels
│   │   │   ├── manager.py
│   │   │   ├── channels/
│   │   │   │   ├── ticks.py
│   │   │   │   ├── signals.py
│   │   │   │   └── scanner.py
│   │   │   └── router.py
│   │   └── v1/                       # API version 1
│   │       ├── router.py             # Aggregates all v1 routers
│   │       └── endpoints/
│   │           ├── auth.py
│   │           ├── users.py
│   │           ├── symbols.py
│   │           ├── candles.py
│   │           ├── indicators.py
│   │           ├── smart_money.py
│   │           ├── strategies.py
│   │           ├── signals.py
│   │           ├── backtests.py
│   │           ├── paper_trading.py
│   │           ├── scanner.py
│   │           ├── alerts.py
│   │           ├── watchlists.py
│   │           ├── portfolios.py
│   │           ├── ai.py
│   │           └── health.py
│   │
│   ├── config/                       # Configuration
│   │   ├── settings.py
│   │   └── constants.py
│   │
│   ├── core/                         # Cross-cutting concerns
│   │   ├── exceptions.py
│   │   ├── logging.py
│   │   ├── security.py               # JWT, password hashing
│   │   └── types.py                  # Shared type aliases
│   │
│   ├── domain/                       # Pure domain models (no ORM, no FastAPI)
│   │   ├── entities/                 # Business entities
│   │   │   ├── user.py
│   │   │   ├── symbol.py
│   │   │   ├── candle.py
│   │   │   ├── strategy.py
│   │   │   ├── signal.py
│   │   │   └── trade.py
│   │   ├── value_objects/            # Immutable value types
│   │   │   ├── price.py
│   │   │   ├── timeframe.py
│   │   │   └── market_session.py
│   │   └── enums/
│   │       ├── market_type.py
│   │       ├── order_side.py
│   │       └── signal_strength.py
│   │
│   ├── models/                       # SQLAlchemy ORM models (persistence)
│   │   ├── base.py
│   │   ├── user.py
│   │   ├── exchange.py
│   │   ├── symbol.py
│   │   ├── candle.py
│   │   ├── indicator.py
│   │   ├── strategy.py
│   │   ├── signal.py
│   │   ├── trade.py
│   │   ├── backtest.py
│   │   ├── ai.py
│   │   ├── alert.py
│   │   ├── watchlist.py
│   │   ├── portfolio.py
│   │   └── audit.py
│   │
│   ├── schemas/                      # Pydantic request/response DTOs
│   │   ├── common.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── symbol.py
│   │   ├── candle.py
│   │   ├── indicator.py
│   │   ├── strategy.py
│   │   ├── signal.py
│   │   ├── backtest.py
│   │   ├── ai.py
│   │   ├── alert.py
│   │   ├── watchlist.py
│   │   └── portfolio.py
│   │
│   ├── repositories/                 # Data access layer
│   │   ├── base.py
│   │   ├── user.py
│   │   ├── symbol.py
│   │   ├── candle.py
│   │   ├── indicator.py
│   │   ├── strategy.py
│   │   ├── signal.py
│   │   ├── trade.py
│   │   ├── backtest.py
│   │   ├── ai.py
│   │   ├── alert.py
│   │   ├── watchlist.py
│   │   └── portfolio.py
│   │
│   ├── services/                     # Application / use-case services
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── symbols.py
│   │   ├── scanner/
│   │   │   ├── service.py
│   │   │   ├── filters.py
│   │   │   └── criteria.py
│   │   ├── alerts/
│   │   │   ├── service.py
│   │   │   ├── evaluator.py
│   │   │   └── notifiers/
│   │   │       ├── email.py
│   │   │       ├── push.py
│   │   │       └── webhook.py
│   │   ├── watchlists.py
│   │   ├── portfolios.py
│   │   └── health.py
│   │
│   ├── engines/                      # Domain computation engines
│   │   ├── indicators/
│   │   │   ├── registry.py           # Plugin registry
│   │   │   ├── base.py               # Abstract indicator
│   │   │   ├── engine.py             # Orchestrator
│   │   │   └── builtin/              # Built-in indicators
│   │   │       ├── rsi.py
│   │   │       ├── macd.py
│   │   │       ├── ema.py
│   │   │       └── ...
│   │   ├── smart_money/
│   │   │   ├── base.py
│   │   │   ├── engine.py
│   │   │   ├── order_blocks.py
│   │   │   ├── liquidity.py
│   │   │   ├── fvg.py
│   │   │   └── structure.py
│   │   ├── strategies/
│   │   │   ├── registry.py
│   │   │   ├── base.py
│   │   │   ├── engine.py
│   │   │   └── builtin/
│   │   ├── signals/
│   │   │   ├── engine.py
│   │   │   └── aggregator.py
│   │   ├── ai/
│   │   │   ├── registry.py
│   │   │   ├── base.py
│   │   │   ├── trainer.py
│   │   │   ├── inference.py
│   │   │   └── models/
│   │   ├── backtesting/
│   │   │   ├── engine.py
│   │   │   ├── simulator.py
│   │   │   ├── metrics.py
│   │   │   └── slippage.py
│   │   ├── paper_trading/
│   │   │   ├── engine.py
│   │   │   └── order_manager.py
│   │   └── risk/
│   │       ├── engine.py
│   │       ├── position_sizer.py
│   │       └── limits.py
│   │
│   ├── adapters/                     # External market integrations
│   │   ├── base.py                   # Abstract ExchangeAdapter
│   │   ├── registry.py
│   │   ├── nse/
│   │   │   ├── adapter.py
│   │   │   ├── client.py
│   │   │   └── normalizer.py
│   │   ├── binance/
│   │   │   ├── adapter.py
│   │   │   ├── client.py
│   │   │   └── normalizer.py
│   │   ├── bybit/
│   │   └── forex/
│   │
│   ├── pipeline/                     # Data pipeline (Sprint 3+)
│   │   ├── orchestrator.py
│   │   ├── downloader.py
│   │   ├── validator.py
│   │   ├── normalizer.py
│   │   ├── writer.py
│   │   └── jobs/
│   │       ├── historical_sync.py
│   │       └── live_ingestion.py
│   │
│   ├── events/                       # Event-driven architecture
│   │   ├── bus.py                    # Event bus abstraction
│   │   ├── publisher.py
│   │   ├── subscriber.py
│   │   ├── schemas/                  # Event payload definitions
│   │   │   ├── market_updated.py
│   │   │   ├── indicators_calculated.py
│   │   │   ├── signal_generated.py
│   │   │   ├── alert_triggered.py
│   │   │   └── ai_training_completed.py
│   │   └── handlers/                 # Event subscribers
│   │       ├── on_market_updated.py
│   │       ├── on_indicators_calculated.py
│   │       └── ...
│   │
│   ├── jobs/                         # Background task definitions
│   │   ├── celery_app.py
│   │   ├── tasks/
│   │   │   ├── data_sync.py
│   │   │   ├── indicator_compute.py
│   │   │   ├── backtest_run.py
│   │   │   ├── ai_train.py
│   │   │   └── alert_evaluate.py
│   │   └── schedules.py              # Cron / beat schedules
│   │
│   ├── cache/                        # Redis abstractions
│   │   ├── client.py
│   │   ├── keys.py                   # Key naming conventions
│   │   └── layers/
│   │       ├── candles.py
│   │       ├── scanner.py
│   │       └── sessions.py
│   │
│   ├── database/                     # DB infrastructure
│   │   ├── base.py
│   │   ├── session.py
│   │   └── migrations/               # Optional: Alembic helpers
│   │
│   └── utils/
│       ├── datetime.py
│       ├── decimal.py
│       └── pagination.py
│
├── alembic/                          # Database migrations
│   ├── env.py
│   └── versions/
│
├── plugins/                          # Third-party / user plugins (optional install path)
│   ├── indicators/
│   ├── strategies/
│   └── ai_models/
│
├── tests/
│   ├── unit/
│   │   ├── engines/
│   │   ├── services/
│   │   └── adapters/
│   ├── integration/
│   │   ├── api/
│   │   ├── repositories/
│   │   └── pipeline/
│   ├── e2e/
│   └── conftest.py
│
├── docs/                             # Technical documentation
├── scripts/                          # DevOps / maintenance scripts
│   ├── seed_exchanges.py
│   └── partition_maintenance.py
│
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   └── docker-compose.yml
│
├── pyproject.toml
├── requirements.txt
└── README.md
```

---

## Design Rationale

| Decision | Why |
|----------|-----|
| **`domain/` separate from `models/`** | ORM models are persistence details; domain entities are pure business logic testable without DB |
| **`engines/` vs `services/`** | Engines compute (indicators, backtests); services orchestrate use cases (scanner, alerts) |
| **`adapters/` isolated** | New exchanges added without touching engines or API |
| **`events/` first-class** | Event bus is not buried inside services — explicit pub/sub layer |
| **`plugins/` at repo root** | Optional packages installable via entry points without bloating core |
| **Versioned API only** | All routes under `api/v1/`; v2 can coexist |
| **Tests mirror `app/`** | `tests/unit/engines/` maps to `app/engines/` for discoverability |

---

## File Size Guidelines

| Layer | Max lines per file (soft) | Split when |
|-------|---------------------------|------------|
| Endpoints | 150 | More than 5 related routes |
| Services | 300 | Multiple unrelated use cases |
| Engines | 400 | More than one algorithm family |
| Repositories | 250 | Complex query builders |

---

## Import Rules (Enforced by lint / CI)

```
api          → services, schemas, deps
services     → engines, repositories, events, schemas
engines      → domain, repositories, adapters (via interface), events
repositories → models, database
adapters     → domain (value objects only)
models       → database.base
domain       → (nothing from app.*)
events       → domain, schemas
pipeline     → adapters, repositories, events
```
