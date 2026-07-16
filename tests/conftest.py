"""Pytest fixtures and test configuration."""

from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_health_service
from app.config.settings import Settings, get_settings
from app.main import create_app
from app.services.health import HealthService


@pytest.fixture
def test_settings() -> Settings:
    """Override settings for testing."""
    return Settings(
        app_name="TradeMind AI Test",
        app_version="0.1.0-test",
        app_env="development",
        debug=True,
        postgres_host="localhost",
        postgres_port=5432,
        postgres_user="test",
        postgres_password="test",
        postgres_db="test_db",
        log_level="DEBUG",
        log_format="text",
    )


@pytest.fixture
def mock_session() -> AsyncMock:
    """Mock async database session."""
    session = AsyncMock(spec=AsyncSession)
    session.execute = AsyncMock()
    return session


@pytest.fixture
def app(test_settings: Settings):
    """Create FastAPI test application with overridden dependencies."""
    application = create_app(test_settings)

    async def override_get_db() -> AsyncGenerator[AsyncMock, None]:
        session = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        session.execute = AsyncMock(return_value=mock_result)
        yield session

    def override_get_health_service() -> HealthService:
        session = AsyncMock(spec=AsyncSession)
        session.execute = AsyncMock(return_value=MagicMock())
        return HealthService(session=session, settings=test_settings)

    application.dependency_overrides[get_db] = override_get_db
    application.dependency_overrides[get_health_service] = override_get_health_service
    get_settings.cache_clear()

    yield application

    application.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client for API testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def health_service(test_settings: Settings, mock_session: AsyncMock) -> HealthService:
    """HealthService instance with mocked session."""
    return HealthService(session=mock_session, settings=test_settings)
