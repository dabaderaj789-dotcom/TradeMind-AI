"""Shared helpers for broker adapters that need credentials before use."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from app.providers.base import MarketDataProvider
from app.providers.errors import ProviderNotConfiguredError
from app.providers.types import (
    InstrumentMetadata,
    NormalizedGreeks,
    NormalizedOHLC,
    NormalizedOptionChain,
    NormalizedOptionLeg,
    NormalizedOptionStrike,
    NormalizedTick,
    ProviderCapability,
    ProviderHealth,
)


def dec(v: Any) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except Exception:  # noqa: BLE001
        return None


def require_configured(provider: MarketDataProvider) -> None:
    if not provider.is_configured:
        raise ProviderNotConfiguredError(provider.provider_id)


def empty_health(
    provider_id: str,
    *,
    configured: bool,
    capabilities: frozenset[ProviderCapability],
    message: str | None = None,
) -> ProviderHealth:
    return ProviderHealth(
        provider=provider_id,
        status="ok" if configured else "not_configured",
        message=message
        or (
            None
            if configured
            else "Credentials not set — adapter registered but inactive until configured."
        ),
        capabilities=tuple(sorted(c.value for c in capabilities)),
    )


def stub_tick(provider_id: str, symbol_code: str, exchange: str | None) -> NormalizedTick:
    """Never called when not configured — kept for type completeness in stubs."""
    return NormalizedTick(
        symbol_code=symbol_code,
        last=Decimal("0"),
        timestamp=datetime.now(UTC),
        exchange=exchange or "",
        provider=provider_id,
        source="stub",
        market_status="CLOSED",
    )


def build_option_strike(
    strike: Decimal,
    spot: Decimal | None,
    atm: Decimal | None,
    call: NormalizedOptionLeg,
    put: NormalizedOptionLeg,
) -> NormalizedOptionStrike:
    """Moneyness is strike-relative for the *row*; CE/PE ITM is opposite sides of spot.

    Row moneyness uses call convention for display banding:
    - ATM when strike equals ATM
    - For calls: ITM when strike < spot, OTM when strike > spot
    - Put ITM/OTM is inverted at the UI/leg level; row uses call-side banding
      so the ATM highlight stays consistent with broker terminals.
    """
    moneyness: str = "OTM"
    if atm is not None and abs(strike - atm) < Decimal("0.000001"):
        moneyness = "ATM"
    elif spot is not None:
        # Row banding matches call ITM (strike below spot) — industry standard for chain shading
        if strike < spot:
            moneyness = "ITM"
        else:
            moneyness = "OTM"
    return NormalizedOptionStrike(
        strike=strike,
        moneyness=moneyness,  # type: ignore[arg-type]
        call=call,
        put=put,
    )


def leg_from_fields(
    strike: Decimal,
    option_type: str,
    *,
    ltp: Any = None,
    bid: Any = None,
    ask: Any = None,
    volume: Any = None,
    oi: Any = None,
    oi_change: Any = None,
    delta: Any = None,
    gamma: Any = None,
    theta: Any = None,
    vega: Any = None,
    iv: Any = None,
) -> NormalizedOptionLeg:
    greeks = None
    if any(x is not None for x in (delta, gamma, theta, vega, iv)):
        greeks = NormalizedGreeks(
            delta=dec(delta),
            gamma=dec(gamma),
            theta=dec(theta),
            vega=dec(vega),
            iv=dec(iv),
        )
    return NormalizedOptionLeg(
        strike=strike,
        option_type=option_type,  # type: ignore[arg-type]
        ltp=dec(ltp),
        bid=dec(bid),
        ask=dec(ask),
        volume=dec(volume),
        oi=dec(oi),
        oi_change=dec(oi_change),
        greeks=greeks,
    )


# Re-export for adapters
__all__ = [
    "InstrumentMetadata",
    "NormalizedGreeks",
    "NormalizedOHLC",
    "NormalizedOptionChain",
    "NormalizedOptionLeg",
    "NormalizedOptionStrike",
    "NormalizedTick",
    "ProviderCapability",
    "ProviderHealth",
    "build_option_strike",
    "dec",
    "empty_health",
    "leg_from_fields",
    "require_configured",
    "stub_tick",
]
