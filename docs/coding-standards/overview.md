# Coding Standards

## Language & Runtime

- Python 3.12+
- Fully typed — mypy strict mode
- Async for I/O-bound operations (DB, HTTP, WebSocket)

## Style

- **Formatter:** Ruff
- **Line length:** 100 characters
- **Imports:** isort via Ruff — stdlib → third-party → local
- **Naming:** snake_case functions/variables, PascalCase classes, UPPER_SNAKE constants

## Architecture Rules

1. **No business logic in endpoints** — delegate to services
2. **No DB access in services** — use repositories
3. **No FastAPI imports in engines** — engines are framework-agnostic
4. **No ORM models in API responses** — use Pydantic schemas
5. **Domain entities are pure** — no SQLAlchemy, no Pydantic in `domain/`

## Type Hints

```python
# Required on all public functions
async def get_candles(
    symbol_id: uuid.UUID,
    timeframe: Timeframe,
    *,
    limit: int = 100,
) -> list[Candle]:
    ...
```

## Error Handling

- Raise domain exceptions (`NotFoundError`, `ValidationError`) — never raw HTTPException in services
- Global handlers convert to JSON responses
- Log warnings for expected errors, exceptions for unexpected

## Logging

- Use Loguru via `from loguru import logger`
- Structured context: `logger.bind(symbol_id=..., timeframe=...)`
- Never log secrets, API keys, or passwords

## Testing

- pytest + pytest-asyncio
- Unit tests for engines and services (no DB)
- Integration tests for repositories and API
- Contract tests for plugins and adapters
- Minimum 80% coverage on engines and services

## Documentation

- Docstrings on all public classes and methods (Google style)
- Architecture changes update `/docs`
- API changes update `/docs/api/endpoints.md`

## Git

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Feature branches → PR →  `main`
- No direct commits to `main`

## Dependencies

- Pin major versions in `requirements.txt`
- No unnecessary dependencies
- Security audit via `pip audit` in CI
