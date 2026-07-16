"""Replay Studio REST endpoints — internal engineering validation tool."""

import uuid

from fastapi import APIRouter, Query

from app.api.deps import ReplayStudioServiceDep
from app.schemas.replay_studio import (
    ReplayDebugResponse,
    ReplayEventJumpRequest,
    ReplayEventsListResponse,
    ReplayFrameResponse,
    ReplayInspectorResponse,
    ReplayJumpRequest,
    ReplayMetricsResponse,
    ReplayPlaybackHintResponse,
    ReplayPlaybackRequest,
    ReplaySessionCreateRequest,
    ReplaySessionResponse,
    ReplaySettingsRequest,
    ReplayStepRequest,
)

router = APIRouter(prefix="/replay-studio")


@router.post("/sessions", response_model=ReplaySessionResponse, summary="Create replay session")
async def create_session(
    body: ReplaySessionCreateRequest,
    service: ReplayStudioServiceDep,
) -> ReplaySessionResponse:
    """Load historical data server-side; client only receives frames up to current index."""
    return await service.create_session(body)


@router.get("/sessions/{session_id}", response_model=ReplaySessionResponse, summary="Session state")
async def get_session(
    session_id: uuid.UUID,
    service: ReplayStudioServiceDep,
) -> ReplaySessionResponse:
    return await service.get_session(session_id)


@router.delete("/sessions/{session_id}", summary="Delete replay session")
async def delete_session(
    session_id: uuid.UUID,
    service: ReplayStudioServiceDep,
) -> dict[str, bool]:
    await service.delete_session(session_id)
    return {"success": True}


@router.get("/sessions/{session_id}/frame", response_model=ReplayFrameResponse, summary="Current frame")
async def get_frame(
    session_id: uuid.UUID,
    service: ReplayStudioServiceDep,
    overlays: str | None = Query(None, description="Comma-separated overlay keys"),
) -> ReplayFrameResponse:
    enabled = set(overlays.split(",")) if overlays else None
    return await service.get_frame(session_id, enabled)


@router.post(
    "/sessions/{session_id}/step-forward",
    response_model=ReplayFrameResponse,
    summary="Step forward",
)
async def step_forward(
    session_id: uuid.UUID,
    body: ReplayStepRequest,
    service: ReplayStudioServiceDep,
) -> ReplayFrameResponse:
    return await service.step_forward(session_id, body.steps)


@router.post(
    "/sessions/{session_id}/step-back",
    response_model=ReplayFrameResponse,
    summary="Step back",
)
async def step_back(
    session_id: uuid.UUID,
    body: ReplayStepRequest,
    service: ReplayStudioServiceDep,
) -> ReplayFrameResponse:
    return await service.step_back(session_id, body.steps)


@router.post("/sessions/{session_id}/jump", response_model=ReplayFrameResponse, summary="Jump to index/date")
async def jump(
    session_id: uuid.UUID,
    body: ReplayJumpRequest,
    service: ReplayStudioServiceDep,
) -> ReplayFrameResponse:
    return await service.jump(session_id, index=body.index, open_time=body.open_time)


@router.post(
    "/sessions/{session_id}/jump-event",
    response_model=ReplayFrameResponse,
    summary="Jump to event",
)
async def jump_event(
    session_id: uuid.UUID,
    body: ReplayEventJumpRequest,
    service: ReplayStudioServiceDep,
) -> ReplayFrameResponse:
    return await service.jump_event(
        session_id, event_id=body.event_id, direction=body.direction,
    )


@router.post(
    "/sessions/{session_id}/playback",
    response_model=ReplayPlaybackHintResponse,
    summary="Play / pause",
)
async def set_playback(
    session_id: uuid.UUID,
    body: ReplayPlaybackRequest,
    service: ReplayStudioServiceDep,
) -> ReplayPlaybackHintResponse:
    return await service.set_playback(session_id, playing=body.playing, speed=body.speed)


@router.patch(
    "/sessions/{session_id}/settings",
    response_model=ReplaySessionResponse,
    summary="Update session settings",
)
async def update_settings(
    session_id: uuid.UUID,
    body: ReplaySettingsRequest,
    service: ReplayStudioServiceDep,
) -> ReplaySessionResponse:
    return await service.update_settings(session_id, body)


@router.get(
    "/sessions/{session_id}/inspector",
    response_model=ReplayInspectorResponse,
    summary="Inspector panel data",
)
async def get_inspector(
    session_id: uuid.UUID,
    service: ReplayStudioServiceDep,
    bar_index: int | None = Query(None, ge=0),
) -> ReplayInspectorResponse:
    return await service.get_inspector(session_id, bar_index)


@router.get(
    "/sessions/{session_id}/events",
    response_model=ReplayEventsListResponse,
    summary="Event log",
)
async def list_events(
    session_id: uuid.UUID,
    service: ReplayStudioServiceDep,
) -> ReplayEventsListResponse:
    return await service.list_events(session_id)


@router.get(
    "/sessions/{session_id}/debug",
    response_model=ReplayDebugResponse,
    summary="Debug mode payloads",
)
async def get_debug(
    session_id: uuid.UUID,
    service: ReplayStudioServiceDep,
) -> ReplayDebugResponse:
    return await service.get_debug(session_id)


@router.get(
    "/sessions/{session_id}/metrics",
    response_model=ReplayMetricsResponse,
    summary="Performance metrics",
)
async def get_metrics(
    session_id: uuid.UUID,
    service: ReplayStudioServiceDep,
) -> ReplayMetricsResponse:
    return await service.get_metrics(session_id)
