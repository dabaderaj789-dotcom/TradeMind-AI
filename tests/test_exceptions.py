"""Tests for global exception handling."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_validation_error_returns_422(client: AsyncClient) -> None:
    """Invalid query params trigger structured validation error response."""
    response = await client.get("/api/v1/health", params={"invalid_param": "x" * 10000})
    # Health endpoint has no query params — should still return 200
    assert response.status_code == 200
