"""Validation Toolkit application service."""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError as AppValidationError
from app.engines.replay_studio.store import ReplaySessionStore
from app.engines.validation.analytics import compute_dashboard, compute_recurring_issues
from app.engines.validation.constants import (
    REJECTION_REASON_LABELS,
    REASON_TO_PLUGIN,
    ValidationVerdict,
    plugin_issues_from_reason,
)
from app.repositories.trade_setup import TradeSetupRepository
from app.repositories.validation import ValidationFilter, ValidationRepository
from app.schemas.validation import (
    RejectionReasonOption,
    ValidationDashboardResponse,
    ValidationReportResponse,
    ValidationReviewListResponse,
    ValidationReviewRequest,
    ValidationReviewResponse,
    ValidationSetupQueueItem,
    ValidationSetupQueueResponse,
)


@dataclass
class ValidationService:
    session: AsyncSession

    async def submit_review(self, request: ValidationReviewRequest) -> ValidationReviewResponse:
        setup = await TradeSetupRepository(self.session).get_by_id(request.setup_id)
        if setup is None:
            raise NotFoundError("Trade setup not found", detail=request.setup_id)

        if request.verdict == ValidationVerdict.INCORRECT and not request.rejection_reason:
            raise AppValidationError(
                "rejection_reason is required when verdict is incorrect",
                detail=request.setup_id,
            )

        plugin_issues = plugin_issues_from_reason(
            request.rejection_reason,
            request.plugin_issues,
        )

        now = datetime.now(UTC)
        row = await ValidationRepository(self.session).upsert_review({
            "setup_id": setup.setup_id,
            "replay_session_id": request.replay_session_id,
            "symbol_id": setup.symbol_id,
            "timeframe_id": setup.timeframe_id,
            "setup_type": setup.setup_type,
            "strategy_id": request.strategy_id,
            "direction": setup.direction,
            "detected_at": setup.detected_at,
            "verdict": request.verdict,
            "rejection_reason": request.rejection_reason,
            "plugin_issues": plugin_issues,
            "notes": request.notes,
            "confidence_score": setup.confidence_score,
            "reviewer": request.reviewer,
            "reviewed_at": now,
            "updated_at": now,
        })

        return await self._to_response(row)

    async def get_review(self, setup_id: str) -> ValidationReviewResponse:
        row = await ValidationRepository(self.session).get_by_setup_id(setup_id)
        if row is None:
            raise NotFoundError("Validation review not found", detail=setup_id)
        return await self._to_response(row)

    async def list_reviews(
        self,
        *,
        symbol_id: uuid.UUID | None = None,
        timeframe: str | None = None,
        strategy_id: str | None = None,
        setup_type: str | None = None,
        verdict: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> ValidationReviewListResponse:
        tf_id = await self._resolve_timeframe_id(timeframe) if timeframe else None
        flt = ValidationFilter(
            symbol_id=symbol_id,
            timeframe_id=tf_id,
            strategy_id=strategy_id,
            setup_type=setup_type,
            verdict=verdict,
            start=start,
            end=end,
            limit=limit,
            offset=offset,
        )
        repo = ValidationRepository(self.session)
        rows = await repo.list_reviews(flt)
        total = await repo.count_reviews(flt)
        items = [await self._to_response(r) for r in rows]
        return ValidationReviewListResponse(items=items, total=total)

    async def get_dashboard(
        self,
        *,
        symbol_id: uuid.UUID | None = None,
        timeframe: str | None = None,
        strategy_id: str | None = None,
        setup_type: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> ValidationDashboardResponse:
        filters = self._filters_dict(symbol_id, timeframe, strategy_id, setup_type, start, end)
        reviews = await self._fetch_review_dicts(
            symbol_id=symbol_id,
            timeframe=timeframe,
            strategy_id=strategy_id,
            setup_type=setup_type,
            start=start,
            end=end,
        )
        stats = compute_dashboard(reviews)
        return ValidationDashboardResponse(filters_applied=filters, **stats)

    async def get_report(
        self,
        *,
        symbol_id: uuid.UUID | None = None,
        timeframe: str | None = None,
        strategy_id: str | None = None,
        setup_type: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> ValidationReportResponse:
        filters = self._filters_dict(symbol_id, timeframe, strategy_id, setup_type, start, end)
        reviews = await self._fetch_review_dicts(
            symbol_id=symbol_id,
            timeframe=timeframe,
            strategy_id=strategy_id,
            setup_type=setup_type,
            start=start,
            end=end,
        )
        report = compute_recurring_issues(reviews)
        return ValidationReportResponse(filters_applied=filters, **report)

    async def export_csv(
        self,
        *,
        symbol_id: uuid.UUID | None = None,
        timeframe: str | None = None,
        strategy_id: str | None = None,
        setup_type: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> str:
        tf_id = await self._resolve_timeframe_id(timeframe) if timeframe else None
        rows = await ValidationRepository(self.session).list_for_export(
            ValidationFilter(
                symbol_id=symbol_id,
                timeframe_id=tf_id,
                strategy_id=strategy_id,
                setup_type=setup_type,
                start=start,
                end=end,
                limit=50_000,
            )
        )

        sym_cache: dict[uuid.UUID, str] = {}
        tf_cache: dict[int, str] = {}

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "setup_id", "symbol", "timeframe", "setup_type", "strategy_id", "direction",
            "detected_at", "verdict", "rejection_reason", "plugin_issues", "notes",
            "confidence_score", "reviewer", "reviewed_at",
        ])

        for row in rows:
            sym = sym_cache.get(row.symbol_id)
            if sym is None:
                s = await SymbolRepository(self.session).get_by_id(row.symbol_id)
                sym = s.symbol_code if s else str(row.symbol_id)
                sym_cache[row.symbol_id] = sym
            tf = tf_cache.get(row.timeframe_id)
            if tf is None:
                t = await TimeframeRepository(self.session).get_by_id(row.timeframe_id)
                tf = t.code if t else str(row.timeframe_id)
                tf_cache[row.timeframe_id] = tf

            writer.writerow([
                row.setup_id,
                sym,
                tf,
                row.setup_type,
                row.strategy_id or "",
                row.direction,
                row.detected_at.isoformat(),
                row.verdict,
                row.rejection_reason or "",
                ";".join(row.plugin_issues or []),
                (row.notes or "").replace("\n", " "),
                row.confidence_score,
                row.reviewer or "",
                row.reviewed_at.isoformat(),
            ])

        return output.getvalue()

    async def get_setup_queue(self, session_id: uuid.UUID) -> ValidationSetupQueueResponse:
        replay = ReplaySessionStore.get(session_id)
        setup_rows = await TradeSetupRepository(self.session).list_setups(
            symbol_id=replay.symbol_id,
            timeframe_id=replay.timeframe_id,
            limit=5000,
        )
        setup_ids = [s.setup_id for s in setup_rows]
        reviews = await ValidationRepository(self.session).get_reviews_for_setups(setup_ids)

        items: list[ValidationSetupQueueItem] = []
        reviewed = 0
        for setup in setup_rows:
            bar_index = replay.time_to_index.get(setup.detected_at, 0)
            review_row = reviews.get(setup.setup_id)
            review_resp = await self._to_response(review_row) if review_row else None
            if review_resp:
                reviewed += 1
            items.append(
                ValidationSetupQueueItem(
                    setup_id=setup.setup_id,
                    setup_type=setup.setup_type,
                    direction=setup.direction,
                    confidence_score=setup.confidence_score,
                    confidence_level=setup.confidence_level,
                    detected_at=setup.detected_at,
                    bar_index=bar_index,
                    explanation=setup.explanation,
                    review=review_resp,
                )
            )

        items.sort(key=lambda x: x.bar_index)

        return ValidationSetupQueueResponse(
            session_id=session_id,
            validation_mode=getattr(replay, "validation_mode", False),
            total_setups=len(items),
            reviewed_count=reviewed,
            pending_count=len(items) - reviewed,
            items=items,
        )

    def list_rejection_reasons(self) -> list[RejectionReasonOption]:
        return [
            RejectionReasonOption(
                value=reason,
                label=label,
                plugin=REASON_TO_PLUGIN.get(reason, "trade_setup"),
            )
            for reason, label in REJECTION_REASON_LABELS.items()
        ]

    async def _fetch_review_dicts(self, **kwargs) -> list[dict]:
        tf = kwargs.pop("timeframe", None)
        tf_id = await self._resolve_timeframe_id(tf) if tf else None
        flt = ValidationFilter(
            symbol_id=kwargs.get("symbol_id"),
            timeframe_id=tf_id,
            strategy_id=kwargs.get("strategy_id"),
            setup_type=kwargs.get("setup_type"),
            start=kwargs.get("start"),
            end=kwargs.get("end"),
            limit=50_000,
        )
        rows = await ValidationRepository(self.session).list_reviews(flt)
        return [
            {
                "verdict": r.verdict,
                "rejection_reason": r.rejection_reason,
                "plugin_issues": r.plugin_issues or [],
                "setup_type": r.setup_type,
            }
            for r in rows
        ]

    async def _to_response(self, row) -> ValidationReviewResponse:
        sym = await SymbolRepository(self.session).get_by_id(row.symbol_id)
        tf = await TimeframeRepository(self.session).get_by_id(row.timeframe_id)
        return ValidationReviewResponse(
            id=row.id,
            setup_id=row.setup_id,
            symbol_id=row.symbol_id,
            symbol_code=sym.symbol_code if sym else None,
            timeframe=tf.code if tf else None,
            setup_type=row.setup_type,
            strategy_id=row.strategy_id,
            direction=row.direction,
            detected_at=row.detected_at,
            verdict=row.verdict,
            rejection_reason=row.rejection_reason,
            rejection_reason_label=REJECTION_REASON_LABELS.get(row.rejection_reason or ""),
            plugin_issues=list(row.plugin_issues or []),
            notes=row.notes,
            confidence_score=row.confidence_score,
            reviewer=row.reviewer,
            reviewed_at=row.reviewed_at,
        )

    async def _resolve_timeframe_id(self, timeframe: str) -> int:
        tf = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe)
        return tf.id

    def _filters_dict(self, symbol_id, timeframe, strategy_id, setup_type, start, end) -> dict:
        return {
            k: v for k, v in {
                "symbol_id": str(symbol_id) if symbol_id else None,
                "timeframe": timeframe,
                "strategy_id": strategy_id,
                "setup_type": setup_type,
                "start": start.isoformat() if start else None,
                "end": end.isoformat() if end else None,
            }.items() if v is not None
        }
