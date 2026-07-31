"""In-memory paper OMS — no broker calls."""

from __future__ import annotations

import itertools
import uuid
from datetime import UTC, datetime

from app.brokers.execution.types import OrderIntent, OrderResult, TradingMode

_seq = itertools.count(1)


class PaperBroker:
    broker_id = "paper"

    def __init__(self) -> None:
        self.orders: list[OrderResult] = []

    async def place(self, intent: OrderIntent) -> OrderResult:
        oid = f"PAPER-{next(_seq):05d}-{uuid.uuid4().hex[:6]}"
        result = OrderResult(
            ok=True,
            mode=TradingMode.PAPER,
            order_id=oid,
            message="Paper fill simulated (not sent to Angel)",
            symbol_code=intent.symbol_code,
            side=intent.side,
            quantity=intent.quantity,
            broker=self.broker_id,
            submitted_at=datetime.now(UTC),
            raw={
                "order_type": intent.order_type,
                "product": intent.product,
                "price": str(intent.price) if intent.price is not None else None,
                "tag": intent.tag,
            },
        )
        self.orders.append(result)
        return result
