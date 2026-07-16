# Contributing Guide

## Getting Started

1. Read [Architecture Overview](../architecture/overview.md)
2. Read [Coding Standards](../coding-standards/overview.md)
3. Set up local environment (see root `README.md`)
4. Pick an issue from the roadmap or open a discussion

## Development Workflow

```bash
git checkout -b feat/my-feature
# make changes
pytest -v
ruff check app tests
mypy app
git commit -m "feat: add RSI indicator plugin"
# open PR
```

## Adding a New Exchange Adapter

1. Create `app/adapters/{exchange}/` following [Market Adapters](../architecture/market-adapters.md)
2. Implement all `ExchangeAdapter` methods
3. Add normalizer tests with sample exchange payloads
4. Pass `AdapterContractTest`
5. Register via entry point or registry
6. Add seed data for `exchanges` table
7. Update docs

## Adding a New Indicator

1. Subclass `BaseIndicator` in `app/engines/indicators/builtin/` or external plugin
2. Define `parameters_schema` and `output_schema` (Pydantic)
3. Implement `compute()` with warm-up handling
4. Pass indicator contract tests
5. Register in `IndicatorRegistry`

## Adding a New Strategy

1. Subclass `BaseStrategy`
2. Declare `required_timeframes` and `required_indicators`
3. Implement `evaluate()` returning `StrategyResult`
4. Add unit tests with sample context
5. Register in `StrategyRegistry`

## Adding a New AI Model

1. Subclass `BaseAIModel`
2. Implement `train()`, `predict()`, `save()`, `load()`
3. Define feature requirements
4. Add training tests with synthetic data
5. Register in `AIModelRegistry`

## Database Changes

1. Modify ORM model in `app/models/`
2. Generate migration: `alembic revision --autogenerate -m "description"`
3. Review generated SQL carefully
4. Update [Schema Design](../database/schema-design.md)
5. Test upgrade and downgrade

## API Changes

1. Add endpoint in `app/api/v1/endpoints/`
2. Add Pydantic schemas in `app/schemas/`
3. Add service method in `app/services/`
4. Add tests in `tests/`
5. Update [API Endpoints](../api/endpoints.md)

## Pull Request Checklist

- [ ] Tests pass (`pytest -v`)
- [ ] Lint clean (`ruff check`)
- [ ] Types check (`mypy app`)
- [ ] Docs updated if architecture/API/DB changed
- [ ] No secrets committed
- [ ] Migration included if DB schema changed

## Code Review Focus

- Architecture layer violations (API importing repositories directly)
- Missing type hints
- N+1 query patterns
- Missing error handling
- Performance implications (unindexed queries, missing cache)
