"""API tests for Validation Toolkit."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_validation_service
from app.schemas.validation import (
    ValidationDashboardResponse,
    ValidationReviewResponse,
)


@pytest.fixture
def mock_validation_service() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def validation_client(app, mock_validation_service: AsyncMock):
    app.dependency_overrides[get_validation_service] = lambda: mock_validation_service
    yield app
    app.dependency_overrides.pop(get_validation_service, None)


@pytest.fixture
async def client(validation_client) -> AsyncClient:
    transport = ASGITransport(app=validation_client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_submit_review(client: AsyncClient, mock_validation_service: AsyncMock) -> None:
    mock_validation_service.submit_review = AsyncMock(
        return_value=ValidationReviewResponse(
            id=uuid.uuid4(),
            setup_id="setup-1",
            symbol_id=uuid.uuid4(),
            setup_type="breakout",
            strategy_id=None,
            direction="bullish",
            detected_at=datetime.now(UTC),
            verdict="correct",
            rejection_reason=None,
            plugin_issues=[],
            notes="Looks good",
            confidence_score=72.0,
            reviewer=None,
            reviewed_at=datetime.now(UTC),
        )
    )
    response = await client.post(
        "/api/v1/validation/reviews",
        json={"setup_id": "setup-1", "verdict": "correct", "notes": "Looks good"},
    )
    assert response.status_code == 200
    assert response.json()["verdict"] == "correct"


@pytest.mark.asyncio
async def test_dashboard(client: AsyncClient, mock_validation_service: AsyncMock) -> None:
    mock_validation_service.get_dashboard = AsyncMock(
        return_value=ValidationDashboardResponse(
            filters_applied={},
            total_reviewed=10,
            correct_count=7,
            incorrect_count=2,
            unsure_count=1,
            acceptance_rate_pct=70.0,
            rejection_rate_pct=20.0,
            unsure_rate_pct=10.0,
            rejection_reasons=[],
            plugin_statistics={},
            setup_type_statistics={},
        )
    )
    response = await client.get("/api/v1/validation/dashboard")
    assert response.status_code == 200
    assert response.json()["acceptance_rate_pct"] == 70.0
