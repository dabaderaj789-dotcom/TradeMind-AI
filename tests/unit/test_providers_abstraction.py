"""Smoke tests for market-data provider abstraction (no live network)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.providers.mappers import option_chain_to_response, tick_to_response
from app.providers.registry import init_providers
from app.providers.types import (
    NormalizedOptionChain,
    NormalizedOptionLeg,
    NormalizedOptionStrike,
    NormalizedTick,
    ProviderId,
)


def test_init_providers_registers_all_and_binds_roles() -> None:
    registry = init_providers()
    ids = {p.provider_id for p in registry.list_providers()}
    assert ProviderId.YAHOO_NSE.value in ids
    assert ProviderId.BINANCE.value in ids
    assert ProviderId.ANGEL.value in ids
    assert ProviderId.UPSTOX.value in ids
    assert ProviderId.DHAN.value in ids
    assert ProviderId.ZERODHA.value in ids
    assert ProviderId.TRUEDATA.value in ids
    assert ProviderId.GLOBAL_DATAFEEDS.value in ids
    roles = registry.role_map()
    assert roles["india"] == "yahoo_nse"
    assert roles["crypto"] == "binance"
    assert roles["option_chain"] == "yahoo_nse"
    assert registry.for_exchange("nse").provider_id == "yahoo_nse"
    assert registry.for_exchange("binance").provider_id == "binance"


def test_broker_stubs_not_configured_by_default() -> None:
    import asyncio

    from app.providers.errors import ProviderNotConfiguredError

    registry = init_providers()
    angel = registry.get("angel")
    assert angel.is_configured is False
    with pytest.raises(ProviderNotConfiguredError):
        asyncio.run(angel.get_tick("NIFTY"))


def test_tick_and_option_chain_mappers() -> None:
    import uuid

    tick = NormalizedTick(
        symbol_code="NIFTY",
        last=Decimal("25000.5"),
        timestamp=datetime.now(UTC),
        provider="yahoo_nse",
        source="test",
        market_status="OPEN",
    )
    resp = tick_to_response(tick, symbol_id=uuid.uuid4(), received=datetime.now(UTC))
    assert resp.price == 25000.5
    assert resp.provider == "yahoo_nse"

    chain = NormalizedOptionChain(
        underlying="NIFTY",
        as_of=datetime.now(UTC),
        spot=Decimal("25000"),
        atm_strike=Decimal("25000"),
        expiry="31JUL2026",
        expiries=["31JUL2026"],
        rows=[
            NormalizedOptionStrike(
                strike=Decimal("25000"),
                moneyness="ATM",
                call=NormalizedOptionLeg(
                    strike=Decimal("25000"),
                    option_type="CE",
                    ltp=Decimal("100"),
                ),
                put=NormalizedOptionLeg(
                    strike=Decimal("25000"),
                    option_type="PE",
                    ltp=Decimal("90"),
                ),
            )
        ],
        provider="yahoo_nse",
        source="test",
    )
    out = option_chain_to_response(chain)
    assert out.underlying == "NIFTY"
    assert len(out.rows) == 1
    assert out.rows[0].call.ltp == 100.0
