"""Trading / Angel execution schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


class PlaceOrderRequest(BaseModel):
    symbol_code: str = Field(..., examples=["RELIANCE", "NIFTY"])
    side: Literal["BUY", "SELL"]
    quantity: int = Field(..., gt=0, le=10_000)
    order_type: Literal["MARKET", "LIMIT"] = "MARKET"
    product: Literal["INTRADAY", "DELIVERY", "CARRYFORWARD"] = "INTRADAY"
    price: Decimal | None = None
    tag: str = "TradeMind"


class PlaceOrderResponse(BaseModel):
    ok: bool
    mode: str
    order_id: str | None
    message: str
    symbol_code: str
    side: str
    quantity: int
    broker: str
    submitted_at: datetime
    raw: dict[str, Any] = Field(default_factory=dict)


class KillSwitchRequest(BaseModel):
    enabled: bool


class TradingStatusResponse(BaseModel):
    mode: str
    live_enabled: bool
    kill_switch: bool
    angel_configured: bool
    max_qty: int
    max_orders_per_day: int
    orders_today: int
    paper_orders: int
    note: str
