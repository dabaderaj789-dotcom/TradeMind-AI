"""Health check endpoint."""

from fastapi import APIRouter, Response, status

from app.api.deps import HealthServiceDep
from app.schemas.common import HealthResponse

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns application health status including database connectivity.",
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse},
    },
)
async def health_check(service: HealthServiceDep, response: Response) -> HealthResponse:
    """Check application and dependency health."""
    health = await service.get_health()

    if health.status == "unhealthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return health
