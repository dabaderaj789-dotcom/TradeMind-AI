"""Pydantic schemas for Validation Toolkit API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import BaseSchema


class ValidationReviewRequest(BaseSchema):
    setup_id: str
    verdict: Literal["correct", "incorrect", "unsure"]
    notes: str | None = Field(default=None, max_length=5000)
    rejection_reason: str | None = Field(default=None, max_length=64)
    plugin_issues: list[str] | None = None
    reviewer: str | None = Field(default=None, max_length=128)
    replay_session_id: UUID | None = None
    strategy_id: str | None = None


class ValidationReviewResponse(BaseSchema):
    id: UUID
    setup_id: str
    symbol_id: UUID
    symbol_code: str | None = None
    timeframe: str | None = None
    setup_type: str
    strategy_id: str | None
    direction: str
    detected_at: datetime
    verdict: str
    rejection_reason: str | None
    rejection_reason_label: str | None = None
    plugin_issues: list[str]
    notes: str | None
    confidence_score: float
    reviewer: str | None
    reviewed_at: datetime


class ValidationReviewListResponse(BaseSchema):
    items: list[ValidationReviewResponse]
    total: int


class ValidationDashboardResponse(BaseSchema):
    filters_applied: dict[str, Any]
    total_reviewed: int
    correct_count: int
    incorrect_count: int
    unsure_count: int
    acceptance_rate_pct: float
    rejection_rate_pct: float
    unsure_rate_pct: float
    rejection_reasons: list[dict[str, Any]]
    plugin_statistics: dict[str, Any]
    setup_type_statistics: dict[str, Any]


class ValidationIssueItem(BaseSchema):
    category: str
    key: str
    label: str
    count: int
    pct_of_incorrect: float
    severity: str


class ValidationReportResponse(BaseSchema):
    summary: str
    incorrect_total: int
    issues: list[ValidationIssueItem]
    recommendations: list[str]
    filters_applied: dict[str, Any]


class ValidationSetupQueueItem(BaseSchema):
    setup_id: str
    setup_type: str
    direction: str
    confidence_score: float
    confidence_level: str
    detected_at: datetime
    bar_index: int
    explanation: str
    review: ValidationReviewResponse | None = None


class ValidationSetupQueueResponse(BaseSchema):
    session_id: UUID
    validation_mode: bool
    total_setups: int
    reviewed_count: int
    pending_count: int
    items: list[ValidationSetupQueueItem]


class RejectionReasonOption(BaseSchema):
    value: str
    label: str
    plugin: str
