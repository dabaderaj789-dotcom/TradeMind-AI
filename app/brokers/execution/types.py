"""Normalized order intent / result for paper + Angel live."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal


class TradingMode(StrEnum):
    PAPER = "paper"
    LIVE = "live"


@dataclass(slots=True)
class OrderIntent:
    symbol_code: str
    side: Literal["BUY", "SELL"]
    quantity: int
    order_type: Literal["MARKET", "LIMIT"] = "MARKET"
    product: Literal["INTRADAY", "DELIVERY", "CARRYFORWARD"] = "INTRADAY"
    price: Decimal | None = None
    exchange: str | None = None
    tradingsymbol: str | None = None
    symboltoken: str | None = None
    tag: str = "TradeMind"
    variety: str = "NORMAL"


@dataclass(slots=True)
class OrderResult:
    ok: bool
    mode: TradingMode
    order_id: str | None
    message: str
    symbol_code: str
    side: str
    quantity: int
    broker: str
    submitted_at: datetime
    raw: dict[str, Any] = field(default_factory=dict)
