"""Strategy application service."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.engines.analysis.utils import hash_parameters
from app.engines.strategy.engine import StrategyEngine
from app.engines.strategy.registry import get_strategy_registry
from app.engines.strategy.types import SetupInput, TradePlan
from app.repositories.strategy_backtest import StrategyRepository, TradePlanRepository
from app.repositories.trade_setup import TradeSetupRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.strategy_backtest import (
    StrategyDetailResponse,
    StrategyExecuteRequest,
    StrategyExecuteResponse,
    StrategyListResponse,
    StrategyMetadataResponse,
    TradePlanResponse,
)


@dataclass
class StrategyService:
    session: AsyncSession

    async def list_strategies(self) -> StrategyListResponse:
        registry = get_strategy_registry()
        repo = StrategyRepository(self.session)
        items: list[StrategyMetadataResponse] = []
        for meta in registry.list_metadata():
            await repo.sync_definition(meta)
            await repo.ensure_version(
                meta["strategy_id"],
                meta["strategy_version"],
                meta["default_parameters"],
            )
            items.append(StrategyMetadataResponse(
                strategy_id=meta["strategy_id"],
                strategy_name=meta["strategy_name"],
                strategy_version=meta["strategy_version"],
                description=meta["description"],
                supported_markets=meta["supported_markets"],
                supported_timeframes=meta["supported_timeframes"],
                required_setup_types=meta["required_setup_types"],
                default_parameters=meta["default_parameters"],
            ))
        return StrategyListResponse(items=items, total=len(items))

    async def get_details(self, strategy_id: str, symbol_id: uuid.UUID, timeframe: str) -> StrategyDetailResponse:
        registry = get_strategy_registry()
        strategy = registry.get(strategy_id)
        meta = strategy.metadata()
        def_row = await StrategyRepository(self.session).get_definition(strategy_id)
        if def_row is None:
            raise NotFoundError("Strategy not found", detail=strategy_id)

        tf = await TimeframeRepository(self.session).get_by_code_or_raise(timeframe)
        plans = await TradePlanRepository(self.session).list_plans(
            symbol_id=symbol_id, timeframe_id=tf.id, strategy_id=strategy_id, limit=20,
        )

        return StrategyDetailResponse(
            strategy=StrategyMetadataResponse(
                strategy_id=meta["strategy_id"],
                strategy_name=meta["strategy_name"],
                strategy_version=meta["strategy_version"],
                description=meta["description"],
                supported_markets=meta["supported_markets"],
                supported_timeframes=meta["supported_timeframes"],
                required_setup_types=meta["required_setup_types"],
                default_parameters=meta["default_parameters"],
            ),
            recent_plans=[_plan_to_response(p) for p in plans],
        )

    async def execute(self, request: StrategyExecuteRequest) -> StrategyExecuteResponse:
        symbol = await SymbolRepository(self.session).get_by_id_or_raise(request.symbol_id)
        timeframe = await TimeframeRepository(self.session).get_by_code_or_raise(request.timeframe)
        registry = get_strategy_registry()
        strategy = registry.get(request.strategy_id)
        params = strategy.validate(request.parameters)
        params_hash = hash_parameters(params)

        setup_repo = TradeSetupRepository(self.session)
        setups = await setup_repo.list_setups(
            symbol_id=symbol.id,
            timeframe_id=timeframe.id,
            status=request.setup_status,
            limit=request.limit,
        )
        if request.min_setup_confidence is not None:
            setups = [s for s in setups if s.confidence_score >= request.min_setup_confidence]

        engine = StrategyEngine()
        inputs = [SetupInput.from_record(s) for s in setups]
        batch = engine.evaluate_batch(strategy, inputs, params)

        plans: list[TradePlan] = []
        rejected = 0
        for setup, evaluation, plan in batch:
            if plan is None:
                rejected += 1
            else:
                plans.append(plan)

        if plans:
            await TradePlanRepository(self.session).save_plans(
                plans=plans,
                symbol_id=symbol.id,
                timeframe_id=timeframe.id,
            )

        strat_repo = StrategyRepository(self.session)
        await strat_repo.sync_definition(strategy.metadata())
        await strat_repo.ensure_version(
            strategy.strategy_id(),
            strategy.strategy_version(),
            params,
        )

        return StrategyExecuteResponse(
            symbol_id=symbol.id,
            timeframe=timeframe.code,
            strategy_id=strategy.strategy_id(),
            strategy_version=strategy.strategy_version(),
            params_hash=params_hash,
            plans_generated=len(plans),
            setups_evaluated=len(batch),
            setups_rejected=rejected,
        )


def _plan_to_response(row) -> TradePlanResponse:
    return TradePlanResponse(
        plan_id=row.plan_id,
        strategy_id=row.strategy_id,
        setup_id=row.setup_id,
        direction=row.direction,
        entry_zone=row.entry_zone,
        stop_loss=row.stop_loss,
        target_1=row.target_1,
        target_2=row.target_2,
        target_3=row.target_3,
        risk_reward=row.risk_reward,
        trade_expiration_bars=row.trade_expiration_bars,
        position_risk_pct=row.position_risk_pct,
        strategy_confidence=row.strategy_confidence,
        reasoning=row.reasoning,
        detected_at=row.detected_at,
    )
