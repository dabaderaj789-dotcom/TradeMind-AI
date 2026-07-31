"""Personal Angel / paper trading endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.brokers.execution.service import get_trading_service
from app.brokers.execution.types import OrderIntent
from app.schemas.trading import (
    KillSwitchRequest,
    PlaceOrderRequest,
    PlaceOrderResponse,
    TradingStatusResponse,
)

router = APIRouter(prefix="/trading", tags=["Trading"])


@router.get("/status", response_model=TradingStatusResponse, summary="Trading mode + Angel readiness")
async def trading_status() -> TradingStatusResponse:
    return TradingStatusResponse(**get_trading_service().status())


@router.post("/kill-switch", response_model=TradingStatusResponse, summary="Enable/disable kill switch")
async def set_kill_switch(body: KillSwitchRequest) -> TradingStatusResponse:
    return TradingStatusResponse(**get_trading_service().set_kill_switch(body.enabled))


@router.post("/orders", response_model=PlaceOrderResponse, summary="Place paper (default) or live Angel order")
async def place_order(body: PlaceOrderRequest) -> PlaceOrderResponse:
    svc = get_trading_service()
    result = await svc.place_order(
        OrderIntent(
            symbol_code=body.symbol_code.upper(),
            side=body.side,
            quantity=body.quantity,
            order_type=body.order_type,
            product=body.product,
            price=body.price,
            tag=body.tag,
        )
    )
    return PlaceOrderResponse(
        ok=result.ok,
        mode=result.mode.value,
        order_id=result.order_id,
        message=result.message,
        symbol_code=result.symbol_code,
        side=result.side,
        quantity=result.quantity,
        broker=result.broker,
        submitted_at=result.submitted_at,
        raw=result.raw,
    )
