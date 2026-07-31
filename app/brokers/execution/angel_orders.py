"""Live Angel order placement (blocked unless risk gates pass)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.brokers.angel.client import AngelApiError, AngelSmartApiClient
from app.brokers.angel.symbols import resolve_angel_instrument
from app.brokers.execution.types import OrderIntent, OrderResult, TradingMode


class AngelOrderGateway:
    broker_id = "angel"

    def __init__(self, client: AngelSmartApiClient) -> None:
        self._client = client

    async def place(self, intent: OrderIntent) -> OrderResult:
        inst = resolve_angel_instrument(intent.symbol_code)
        exchange = intent.exchange or (inst.exchange if inst else "NSE")
        tradingsymbol = intent.tradingsymbol or (inst.tradingsymbol if inst else intent.symbol_code)
        token = intent.symboltoken or (inst.symboltoken if inst else None)
        if not token:
            return OrderResult(
                ok=False,
                mode=TradingMode.LIVE,
                order_id=None,
                message=f"No Angel symboltoken for {intent.symbol_code}",
                symbol_code=intent.symbol_code,
                side=intent.side,
                quantity=intent.quantity,
                broker=self.broker_id,
                submitted_at=datetime.now(UTC),
            )

        product = {
            "INTRADAY": "INTRADAY",
            "DELIVERY": "DELIVERY",
            "CARRYFORWARD": "CARRYFORWARD",
        }.get(intent.product, "INTRADAY")

        params: dict[str, Any] = {
            "variety": intent.variety,
            "tradingsymbol": tradingsymbol,
            "symboltoken": token,
            "transactiontype": intent.side,
            "exchange": exchange,
            "ordertype": intent.order_type,
            "producttype": product,
            "duration": "DAY",
            "quantity": str(intent.quantity),
            "squareoff": "0",
            "stoploss": "0",
        }
        if intent.order_type == "LIMIT":
            if intent.price is None:
                return OrderResult(
                    ok=False,
                    mode=TradingMode.LIVE,
                    order_id=None,
                    message="LIMIT order requires price",
                    symbol_code=intent.symbol_code,
                    side=intent.side,
                    quantity=intent.quantity,
                    broker=self.broker_id,
                    submitted_at=datetime.now(UTC),
                )
            params["price"] = str(intent.price)
        else:
            params["price"] = "0"

        try:
            raw = await self._client.place_order(params)
        except AngelApiError as exc:
            return OrderResult(
                ok=False,
                mode=TradingMode.LIVE,
                order_id=None,
                message=str(exc),
                symbol_code=intent.symbol_code,
                side=intent.side,
                quantity=intent.quantity,
                broker=self.broker_id,
                submitted_at=datetime.now(UTC),
                raw=exc.payload,
            )

        data = raw.get("data") or {}
        order_id = str(data.get("orderid") or data.get("orderId") or "") or None
        return OrderResult(
            ok=True,
            mode=TradingMode.LIVE,
            order_id=order_id,
            message=str(raw.get("message") or "Order placed on Angel"),
            symbol_code=intent.symbol_code,
            side=intent.side,
            quantity=intent.quantity,
            broker=self.broker_id,
            submitted_at=datetime.now(UTC),
            raw=raw if isinstance(raw, dict) else {"response": raw},
        )
