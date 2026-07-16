"""Analysis Engine REST endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import AnalysisServiceDep
from app.schemas.analysis import (
    AnalysisResultListResponse,
    ExecuteAnalysisRequest,
    ExecuteAnalysisResponse,
    PluginMetadataResponse,
)

router = APIRouter(prefix="/analysis")


@router.get("/plugins", response_model=list[PluginMetadataResponse], summary="List analysis plugins")
async def list_plugins(service: AnalysisServiceDep) -> list[PluginMetadataResponse]:
    """List all registered analysis plugins with metadata."""
    return await service.list_plugins()


@router.get(
    "/plugins/{plugin_id}",
    response_model=PluginMetadataResponse,
    summary="Get plugin metadata",
)
async def get_plugin_metadata(
    plugin_id: str,
    service: AnalysisServiceDep,
) -> PluginMetadataResponse:
    """Return metadata for a single analysis plugin."""
    return await service.get_plugin_metadata(plugin_id)


@router.post("/execute", response_model=ExecuteAnalysisResponse, summary="Execute analysis")
async def execute_analysis(
    body: ExecuteAnalysisRequest,
    service: AnalysisServiceDep,
) -> ExecuteAnalysisResponse:
    """
    Run one or more analysis plugins against stored candles.

    Plugins execute in parallel with error isolation — one failure does not stop others.
    """
    return await service.execute(body)


@router.get(
    "/results/{symbol_id}",
    response_model=AnalysisResultListResponse,
    summary="Retrieve stored analysis results",
)
async def get_analysis_results(
    symbol_id: uuid.UUID,
    service: AnalysisServiceDep,
    timeframe: str = Query(..., description="Timeframe code"),
    plugin_id: str | None = Query(None),
    plugin_version: str | None = Query(None),
    params_hash: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> AnalysisResultListResponse:
    """Retrieve persisted analysis results for a symbol and timeframe."""
    return await service.get_results(
        symbol_id,
        timeframe,
        plugin_id=plugin_id,
        plugin_version=plugin_version,
        params_hash=params_hash,
        start=start,
        end=end,
        limit=limit,
    )
