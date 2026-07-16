"""Validation Toolkit REST endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

from app.api.deps import ValidationServiceDep
from app.schemas.validation import (
    RejectionReasonOption,
    ValidationDashboardResponse,
    ValidationReportResponse,
    ValidationReviewListResponse,
    ValidationReviewRequest,
    ValidationReviewResponse,
    ValidationSetupQueueResponse,
)

router = APIRouter(prefix="/validation")


@router.get("/rejection-reasons", response_model=list[RejectionReasonOption], summary="Rejection reason options")
async def list_rejection_reasons(service: ValidationServiceDep) -> list[RejectionReasonOption]:
    return service.list_rejection_reasons()


@router.post("/reviews", response_model=ValidationReviewResponse, summary="Submit setup review")
async def submit_review(
    body: ValidationReviewRequest,
    service: ValidationServiceDep,
) -> ValidationReviewResponse:
    return await service.submit_review(body)


@router.get("/reviews/{setup_id}", response_model=ValidationReviewResponse, summary="Get review by setup")
async def get_review(
    setup_id: str,
    service: ValidationServiceDep,
) -> ValidationReviewResponse:
    return await service.get_review(setup_id)


@router.get("/reviews", response_model=ValidationReviewListResponse, summary="List reviews")
async def list_reviews(
    service: ValidationServiceDep,
    symbol_id: uuid.UUID | None = Query(None),
    timeframe: str | None = Query(None),
    strategy_id: str | None = Query(None),
    setup_type: str | None = Query(None),
    verdict: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> ValidationReviewListResponse:
    return await service.list_reviews(
        symbol_id=symbol_id,
        timeframe=timeframe,
        strategy_id=strategy_id,
        setup_type=setup_type,
        verdict=verdict,
        start=start,
        end=end,
        limit=limit,
        offset=offset,
    )


@router.get("/dashboard", response_model=ValidationDashboardResponse, summary="Validation dashboard")
async def get_dashboard(
    service: ValidationServiceDep,
    symbol_id: uuid.UUID | None = Query(None),
    timeframe: str | None = Query(None),
    strategy_id: str | None = Query(None),
    setup_type: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
) -> ValidationDashboardResponse:
    return await service.get_dashboard(
        symbol_id=symbol_id,
        timeframe=timeframe,
        strategy_id=strategy_id,
        setup_type=setup_type,
        start=start,
        end=end,
    )


@router.get("/report", response_model=ValidationReportResponse, summary="Recurring issues report")
async def get_report(
    service: ValidationServiceDep,
    symbol_id: uuid.UUID | None = Query(None),
    timeframe: str | None = Query(None),
    strategy_id: str | None = Query(None),
    setup_type: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
) -> ValidationReportResponse:
    return await service.get_report(
        symbol_id=symbol_id,
        timeframe=timeframe,
        strategy_id=strategy_id,
        setup_type=setup_type,
        start=start,
        end=end,
    )


@router.get("/export.csv", summary="Export reviews to CSV", response_class=PlainTextResponse)
async def export_csv(
    service: ValidationServiceDep,
    symbol_id: uuid.UUID | None = Query(None),
    timeframe: str | None = Query(None),
    strategy_id: str | None = Query(None),
    setup_type: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
) -> PlainTextResponse:
    content = await service.export_csv(
        symbol_id=symbol_id,
        timeframe=timeframe,
        strategy_id=strategy_id,
        setup_type=setup_type,
        start=start,
        end=end,
    )
    return PlainTextResponse(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=validation_reviews.csv"},
    )


@router.get(
    "/sessions/{session_id}/setups",
    response_model=ValidationSetupQueueResponse,
    summary="Setup queue for replay session",
)
async def get_session_setup_queue(
    session_id: uuid.UUID,
    service: ValidationServiceDep,
) -> ValidationSetupQueueResponse:
    return await service.get_setup_queue(session_id)
