# TradeMind AI — Technical Documentation

> Sprint 2: System Architecture & Database Design  
> Status: Architecture Phase — no production implementation yet

## Document Index

| Document | Description |
|----------|-------------|
| [Market Data API](./api/market-data.md) | Sprint 3 endpoints and sample requests |
| [Analysis Engine](./analysis/overview.md) | Sprint 4 plugin framework and API |
| [Market Structure](./market-structure/overview.md) | Sprint 5 structure analysis plugin |
| [Order Blocks](./order-blocks/overview.md) | Sprint 6A order block detection plugin |
| [Fair Value Gaps](./fair-value-gaps/overview.md) | Sprint 6B FVG detection plugin |
| [Liquidity Sweeps](./liquidity-sweeps/overview.md) | Sprint 6C liquidity sweep plugin |
| [Trade Setups](./trade-setups/overview.md) | Sprint 7 trade setup engine |
| [Strategy & Backtesting](./strategy-backtest/overview.md) | Sprint 8 strategy and backtest engines |
| [Replay Studio](./replay-studio/overview.md) | Sprint 9 internal validation & replay tool |
| [Validation Toolkit](./validation/overview.md) | Setup review workflow, dashboard, and reports |
| [Architecture Overview](./architecture/overview.md) | System modules, communication patterns, diagrams |
| [Folder Structure](./architecture/folder-structure.md) | Scalable project layout for 100k+ LOC |
| [Market Adapters](./architecture/market-adapters.md) | Exchange adapter interface and extension model |
| [Data Pipeline](./architecture/data-pipeline.md) | End-to-end data flow from exchange to dashboard |
| [Event-Driven Architecture](./architecture/event-driven.md) | Events, publishers, subscribers |
| [Plugin Architecture](./architecture/plugins.md) | Strategies, indicators, AI model plugins |
| [Database Schema](./database/schema-design.md) | Full PostgreSQL schema with indexes and constraints |
| [Database Performance](./database/performance.md) | Partitioning, caching, batching, async jobs |
| [API Reference](./api/endpoints.md) | Complete REST API design (not implemented) |
| [Indicators](./indicators/overview.md) | Indicator framework design |
| [Smart Money Concepts](./smart-money/overview.md) | SMC module design |
| [AI Engine](./ai/overview.md) | Prediction and training architecture |
| [Deployment](./deployment/overview.md) | Infrastructure and deployment topology |
| [Roadmap](./roadmap/overview.md) | Phased delivery plan |
| [Coding Standards](./coding-standards/overview.md) | Engineering conventions |
| [Contributing](./contribution/overview.md) | How to extend the platform |

## Design Principles

1. **Clean Architecture** — strict dependency direction: API → Services → Domain → Repositories → Infrastructure
2. **Open/Closed** — extend via plugins and adapters; never modify core for new exchanges or strategies
3. **Event-Driven** — decouple real-time processing from request/response paths
4. **Multi-Market** — unified internal model; market-specific logic lives in adapters
5. **Scale-First** — partitioning, caching, and async jobs designed in from day one
6. **Type Safety** — fully typed Python 3.12 across all layers

## Quick Links

- Health endpoint (Sprint 1): `GET /api/v1/health`
- API base path: `/api/v1`
- Primary database: PostgreSQL 16 (+ TimescaleDB extension for candles)
- Cache / pub-sub: Redis 7
- Job queue: Celery + Redis (or ARQ as lighter alternative)
