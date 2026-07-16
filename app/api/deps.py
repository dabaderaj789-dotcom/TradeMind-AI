"""FastAPI dependency injection providers."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.registry import get_adapter_registry
from app.config.settings import Settings, get_settings
from app.database.session import get_async_session
from app.engines.analysis.engine import AnalysisEngine
from app.engines.analysis.registry import get_analysis_registry
from app.services.analysis import AnalysisService
from app.services.health import HealthService
from app.services.market_data import MarketDataService
from app.services.fvg import FairValueGapService
from app.services.liquidity_sweep import LiquiditySweepService
from app.services.market_structure import MarketStructureService
from app.services.order_block import OrderBlockService
from app.services.replay_studio import ReplayStudioService
from app.services.validation import ValidationService
from app.services.trade_setup import TradeSetupService
from app.services.backtest import BacktestService
from app.services.strategy import StrategyService
from app.services.quotes import QuoteService


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide an async database session per request."""
    async for session in get_async_session():
        yield session


def get_settings_dep() -> Settings:
    """Provide application settings."""
    return get_settings()


def get_health_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> HealthService:
    """Provide a HealthService instance with injected dependencies."""
    return HealthService(session=session, settings=settings)


def get_market_data_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> MarketDataService:
    """Provide MarketDataService with injected session and adapter registry."""
    return MarketDataService(session=session, adapter_registry=get_adapter_registry())


def get_analysis_engine() -> AnalysisEngine:
    return AnalysisEngine(registry=get_analysis_registry())


def get_analysis_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    engine: Annotated[AnalysisEngine, Depends(get_analysis_engine)],
) -> AnalysisService:
    return AnalysisService(
        session=session,
        engine=engine,
        registry=get_analysis_registry(),
    )


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
MarketDataServiceDep = Annotated[MarketDataService, Depends(get_market_data_service)]
AnalysisServiceDep = Annotated[AnalysisService, Depends(get_analysis_service)]


def get_market_structure_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    analysis_service: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> MarketStructureService:
    return MarketStructureService(session=session, analysis_service=analysis_service)


MarketStructureServiceDep = Annotated[MarketStructureService, Depends(get_market_structure_service)]


def get_order_block_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    analysis_service: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> OrderBlockService:
    return OrderBlockService(session=session, analysis_service=analysis_service)


OrderBlockServiceDep = Annotated[OrderBlockService, Depends(get_order_block_service)]


def get_fair_value_gap_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    analysis_service: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> FairValueGapService:
    return FairValueGapService(session=session, analysis_service=analysis_service)


FairValueGapServiceDep = Annotated[FairValueGapService, Depends(get_fair_value_gap_service)]


def get_liquidity_sweep_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    analysis_service: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> LiquiditySweepService:
    return LiquiditySweepService(session=session, analysis_service=analysis_service)


LiquiditySweepServiceDep = Annotated[LiquiditySweepService, Depends(get_liquidity_sweep_service)]


def get_trade_setup_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    analysis_service: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> TradeSetupService:
    return TradeSetupService(session=session, analysis_service=analysis_service)


TradeSetupServiceDep = Annotated[TradeSetupService, Depends(get_trade_setup_service)]


def get_strategy_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StrategyService:
    return StrategyService(session=session)


StrategyServiceDep = Annotated[StrategyService, Depends(get_strategy_service)]


def get_backtest_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    strategy_service: Annotated[StrategyService, Depends(get_strategy_service)],
) -> BacktestService:
    return BacktestService(session=session, strategy_service=strategy_service)


BacktestServiceDep = Annotated[BacktestService, Depends(get_backtest_service)]


def get_replay_studio_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ReplayStudioService:
    return ReplayStudioService(session=session)


ReplayStudioServiceDep = Annotated[ReplayStudioService, Depends(get_replay_studio_service)]


def get_validation_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ValidationService:
    return ValidationService(session=session)


ValidationServiceDep = Annotated[ValidationService, Depends(get_validation_service)]


def get_quote_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> QuoteService:
    return QuoteService(session=session)


QuoteServiceDep = Annotated[QuoteService, Depends(get_quote_service)]
