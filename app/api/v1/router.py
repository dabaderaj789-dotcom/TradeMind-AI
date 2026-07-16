"""API version 1 route aggregation."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    analysis,
    backtest,
    calendar,
    candles,
    exchanges,
    fvg,
    health,
    liquidity_sweep,
    market_structure,
    order_block,
    quotes,
    strategy,
    symbols,
    trade_setup,
    replay_studio,
    validation,
)

api_v1_router = APIRouter()
api_v1_router.include_router(health.router, tags=["Health"])
api_v1_router.include_router(exchanges.router, tags=["Exchanges"])
api_v1_router.include_router(symbols.router, tags=["Symbols"])
api_v1_router.include_router(candles.router, tags=["Candles"])
api_v1_router.include_router(quotes.router, tags=["Quotes"])
api_v1_router.include_router(calendar.router, tags=["Calendar"])
api_v1_router.include_router(analysis.router, tags=["Analysis"])
api_v1_router.include_router(market_structure.router, tags=["Market Structure"])
api_v1_router.include_router(order_block.router, tags=["Order Blocks"])
api_v1_router.include_router(fvg.router, tags=["Fair Value Gaps"])
api_v1_router.include_router(liquidity_sweep.router, tags=["Liquidity Sweeps"])
api_v1_router.include_router(trade_setup.router, tags=["Trade Setups"])
api_v1_router.include_router(strategy.router, tags=["Strategies"])
api_v1_router.include_router(backtest.router, tags=["Backtesting"])
api_v1_router.include_router(replay_studio.router, tags=["Replay Studio"])
api_v1_router.include_router(validation.router, tags=["Validation"])
