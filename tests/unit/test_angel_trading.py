"""Angel / paper trading risk gates (no live network)."""

from __future__ import annotations

import asyncio

import pytest

from app.brokers.execution.paper import PaperBroker
from app.brokers.execution.risk import RiskConfig, RiskGate
from app.brokers.execution.service import TradingBlockedError, TradingService
from app.brokers.execution.types import OrderIntent, TradingMode
from app.providers.adapters.angel import AngelSmartApiProvider
from app.providers.errors import ProviderNotConfiguredError


def test_angel_provider_not_configured_without_creds() -> None:
    p = AngelSmartApiProvider()
    assert p.is_configured is False
    with pytest.raises(ProviderNotConfiguredError):
        asyncio.run(p.get_tick("NIFTY"))


def test_paper_order_succeeds_by_default() -> None:
    risk = RiskGate(
        RiskConfig(kill_switch=False, live_enabled=False, max_qty=50, max_orders_per_day=20)
    )
    svc = TradingService(
        mode=TradingMode.PAPER,
        risk=risk,
        paper=PaperBroker(),
        angel=None,
        angel_configured=False,
    )

    async def _run() -> None:
        result = await svc.place_order(
            OrderIntent(symbol_code="RELIANCE", side="BUY", quantity=1)
        )
        assert result.ok is True
        assert result.mode == TradingMode.PAPER
        assert result.order_id and result.order_id.startswith("PAPER-")
        assert svc.status()["orders_today"] == 1

    asyncio.run(_run())


def test_kill_switch_blocks_paper() -> None:
    risk = RiskGate(
        RiskConfig(kill_switch=True, live_enabled=False, max_qty=50, max_orders_per_day=20)
    )
    svc = TradingService(
        mode=TradingMode.PAPER,
        risk=risk,
        paper=PaperBroker(),
        angel=None,
        angel_configured=False,
    )
    with pytest.raises(TradingBlockedError):
        asyncio.run(
            svc.place_order(OrderIntent(symbol_code="RELIANCE", side="BUY", quantity=1))
        )


def test_live_blocked_without_dual_opt_in() -> None:
    risk = RiskGate(
        RiskConfig(kill_switch=False, live_enabled=False, max_qty=50, max_orders_per_day=20)
    )
    svc = TradingService(
        mode=TradingMode.LIVE,
        risk=risk,
        paper=PaperBroker(),
        angel=None,
        angel_configured=True,
    )
    with pytest.raises(TradingBlockedError) as exc:
        asyncio.run(
            svc.place_order(OrderIntent(symbol_code="RELIANCE", side="BUY", quantity=1))
        )
    assert "Live trading disabled" in str(exc.value.detail)


def test_max_qty_enforced() -> None:
    risk = RiskGate(
        RiskConfig(kill_switch=False, live_enabled=False, max_qty=2, max_orders_per_day=20)
    )
    svc = TradingService(
        mode=TradingMode.PAPER,
        risk=risk,
        paper=PaperBroker(),
        angel=None,
        angel_configured=False,
    )
    with pytest.raises(TradingBlockedError) as exc:
        asyncio.run(
            svc.place_order(OrderIntent(symbol_code="RELIANCE", side="BUY", quantity=5))
        )
    assert "TRADING_MAX_QTY" in str(exc.value.detail)


def test_limit_order_requires_price_on_angel_gateway() -> None:
    from app.brokers.execution.angel_orders import AngelOrderGateway
    from app.brokers.angel.client import AngelSmartApiClient

    gw = AngelOrderGateway(
        AngelSmartApiClient(
            api_key="k", client_code="c", password="1234", totp_secret="SECRET"
        )
    )

    async def _run() -> None:
        result = await gw.place(
            OrderIntent(
                symbol_code="RELIANCE",
                side="BUY",
                quantity=1,
                order_type="LIMIT",
                price=None,
            )
        )
        assert result.ok is False
        assert "price" in result.message.lower()

    asyncio.run(_run())


def test_resolve_nifty_token() -> None:
    from app.brokers.angel.symbols import resolve_angel_instrument

    inst = resolve_angel_instrument("NIFTY50")
    assert inst is not None
    assert inst.symboltoken == "99926000"
    assert inst.tradingsymbol == "NIFTY"
