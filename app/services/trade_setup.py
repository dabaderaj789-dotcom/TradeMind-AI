"""Trade Setup application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError as AppValidationError
from app.engines.analysis.utils import hash_parameters
from app.engines.trade_setup.engine import TradeSetupEngine, TradeSetupEngineConfig
from app.engines.trade_setup.loader import SOURCE_PLUGINS, load_aligned_context
from app.engines.trade_setup.scoring import DEFAULT_EVIDENCE_WEIGHTS
from app.engines.trade_setup.types import ENGINE_VERSION
from app.repositories.trade_setup import TradeSetupRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.analysis import ExecuteAnalysisRequest, PluginExecutionSpec
from app.schemas.trade_setup import (
    TradeSetupDetailResponse,
    TradeSetupExecuteRequest,
    TradeSetupExecuteResponse,
    TradeSetupListResponse,
    TradeSetupRecord,
    TradeSetupZone,
)
from app.services.analysis import AnalysisService


@dataclass
class TradeSetupService:
    session: AsyncSession
    analysis_service: AnalysisService

    async def execute(self, request: TradeSetupExecuteRequest) -> TradeSetupExecuteResponse:
        symbol = await SymbolRepository(self.session).get_by_id_or_raise(request.symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(request.timeframe)

        params = self._build_config(request.parameters or {})
        params_hash = hash_parameters(params)

        if request.ensure_analysis:
            await self._ensure_source_analysis(request, symbol.id, timeframe.code)

        contexts, analysis_snapshot = await load_aligned_context(
            self.session,
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
            start=request.start,
            end=request.end,
            limit=request.candle_limit,
            scan_from_index=0,
        )

        if not contexts:
            raise AppValidationError(
                "No aligned analysis data available",
                detail=(
                    f"Run source plugins first: {', '.join(SOURCE_PLUGINS)}. "
                    f"symbol_id={symbol.id}, timeframe={timeframe.code}"
                ),
            )

        scan_bars = params.get("scan_bars") if request.incremental else None
        engine_config = TradeSetupEngineConfig(
            evidence_weights=params.get("evidence_weights", DEFAULT_EVIDENCE_WEIGHTS),
            min_confidence=float(params.get("min_confidence", 45.0)),
            expiration_bars=int(params.get("expiration_bars", 20)),
            enabled_setup_types=params.get("enabled_setup_types"),
            scan_bars=int(scan_bars) if scan_bars else None,
        )

        engine = TradeSetupEngine()
        result = engine.detect(contexts, engine_config)
        computed_at = datetime.now(UTC)

        repo = TradeSetupRepository(self.session)
        run = await repo.create_run(
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
            engine_version=ENGINE_VERSION,
            params_hash=params_hash,
            config=params,
            analysis_snapshot=analysis_snapshot,
            setups_detected=len(result.setups),
            bars_scanned=result.bars_scanned,
            computed_at=computed_at,
        )
        await repo.bulk_insert_setups(
            run_id=run.id,
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
            engine_version=ENGINE_VERSION,
            params_hash=params_hash,
            setups=result.setups,
        )

        logger.info(
            "Trade setups detected for {} {} — {} setups",
            symbol.symbol_code,
            timeframe.code,
            len(result.setups),
        )

        return TradeSetupExecuteResponse(
            run_id=run.id,
            symbol_id=symbol.id,
            timeframe=timeframe.code,
            engine_version=ENGINE_VERSION,
            params_hash=params_hash,
            setups_detected=len(result.setups),
            bars_scanned=result.bars_scanned,
            computed_at=computed_at,
        )

    async def list_active(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        setup_type: str | None = None,
        min_confidence: float | None = None,
        limit: int = 100,
    ) -> TradeSetupListResponse:
        return await self._list(
            symbol_id,
            timeframe_code,
            status="active",
            setup_type=setup_type,
            min_confidence=min_confidence,
            limit=limit,
        )

    async def list_historical(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        setup_type: str | None = None,
        direction: str | None = None,
        min_confidence: float | None = None,
        limit: int = 200,
    ) -> TradeSetupListResponse:
        return await self._list(
            symbol_id,
            timeframe_code,
            setup_type=setup_type,
            direction=direction,
            min_confidence=min_confidence,
            limit=limit,
        )

    async def get_details(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        setup_id: str,
    ) -> TradeSetupDetailResponse:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        row = await TradeSetupRepository(self.session).get_by_id(setup_id)
        if row is None or row.symbol_id != symbol_id:
            raise NotFoundError("Trade setup not found", detail=f"setup_id={setup_id}")
        return TradeSetupDetailResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            item=_to_record(row),
        )

    async def _list(
        self,
        symbol_id: uuid.UUID,
        timeframe_code: str,
        *,
        status: str | None = None,
        setup_type: str | None = None,
        direction: str | None = None,
        min_confidence: float | None = None,
        limit: int = 100,
    ) -> TradeSetupListResponse:
        await SymbolRepository(self.session).get_by_id_or_raise(symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        repo = TradeSetupRepository(self.session)
        rows = await repo.list_setups(
            symbol_id=symbol_id,
            timeframe_id=timeframe.id,
            status=status,
            setup_type=setup_type,
            direction=direction,
            min_confidence=min_confidence,
            limit=limit,
        )
        total = await repo.count_setups(
            symbol_id=symbol_id,
            timeframe_id=timeframe.id,
            status=status,
        )
        return TradeSetupListResponse(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            items=[_to_record(r) for r in rows],
            total=total,
        )

    async def _ensure_source_analysis(
        self,
        request: TradeSetupExecuteRequest,
        symbol_id: uuid.UUID,
        timeframe_code: str,
    ) -> None:
        from app.repositories.analysis_result import AnalysisResultRepository

        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe_code)
        result_repo = AnalysisResultRepository(self.session)
        missing = []
        for plugin_id in SOURCE_PLUGINS:
            phash = await result_repo.get_latest_params_hash(symbol_id, timeframe.id, plugin_id)
            if phash is None:
                missing.append(plugin_id)

        if not missing:
            return

        exec_request = ExecuteAnalysisRequest(
            symbol_id=symbol_id,
            timeframe=timeframe_code,
            plugins=[PluginExecutionSpec(plugin_id=p) for p in missing],
            start=request.start,
            end=request.end,
            candle_limit=request.candle_limit,
            persist=True,
        )
        await self.analysis_service.execute(exec_request)

    def _build_config(self, parameters: dict) -> dict:
        weights = dict(DEFAULT_EVIDENCE_WEIGHTS)
        if custom := parameters.get("evidence_weights"):
            weights.update(custom)
        return {
            "evidence_weights": weights,
            "min_confidence": parameters.get("min_confidence", 45.0),
            "expiration_bars": parameters.get("expiration_bars", 20),
            "enabled_setup_types": parameters.get("enabled_setup_types"),
            "scan_bars": parameters.get("scan_bars", 50),
        }


def _to_record(row) -> TradeSetupRecord:
    return TradeSetupRecord(
        setup_id=row.setup_id,
        setup_type=row.setup_type,
        direction=row.direction,
        confidence_score=row.confidence_score,
        confidence_level=row.confidence_level,
        evidence_scores=row.evidence_scores,
        entry_zone=TradeSetupZone(**row.entry_zone),
        stop_loss_zone=TradeSetupZone(**row.stop_loss_zone),
        target_zones=[TradeSetupZone(**z) for z in row.target_zones],
        risk_reward=row.risk_reward,
        status=row.status,
        explanation=row.explanation,
        reference_ids=row.reference_ids,
        detected_at=row.detected_at,
        engine_version=row.engine_version,
        params_hash=row.params_hash,
        run_id=row.run_id,
    )
