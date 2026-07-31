"""Map normalized provider types → API response schemas."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.providers.types import (
    NormalizedOptionChain,
    NormalizedOptionLeg,
    NormalizedTick,
)
from app.schemas.market_engine import (
    LatencyProbe,
    OptionChainResponse,
    OptionLegQuote,
    OptionStrikeRow,
    TickQuoteResponse,
)


def _f(v: Decimal | None) -> float | None:
    if v is None:
        return None
    return float(v)


def tick_to_response(
    tick: NormalizedTick,
    *,
    symbol_id,
    received: datetime,
    sent: datetime | None = None,
) -> TickQuoteResponse:
    sent_at = sent or datetime.now(UTC)
    feed_ms = max(0.0, (received - tick.timestamp).total_seconds() * 1000) if tick.timestamp else None
    backend_ms = max(0.0, (sent_at - received).total_seconds() * 1000)
    bottleneck = "unknown"
    if feed_ms is not None:
        bottleneck = "provider_feed" if feed_ms >= backend_ms else "backend"
    return TickQuoteResponse(
        symbol_id=symbol_id,
        symbol_code=tick.symbol_code,
        price=round(float(tick.last), 4),
        volume=_f(tick.volume),
        market_status=tick.market_status,
        last_updated=tick.timestamp,
        provider=tick.provider,
        source=tick.source,
        latency=LatencyProbe(
            provider_ts=tick.timestamp,
            backend_received_at=received,
            backend_sent_at=sent_at,
            feed_delay_ms=round(feed_ms, 1) if feed_ms is not None else None,
            backend_delay_ms=round(backend_ms, 1),
            source=tick.source,
            bottleneck=bottleneck,
        ),
    )


def _leg_to_schema(leg: NormalizedOptionLeg) -> OptionLegQuote:
    g = leg.greeks
    return OptionLegQuote(
        strike=float(leg.strike),
        option_type=leg.option_type,
        bid=_f(leg.bid),
        ask=_f(leg.ask),
        ltp=_f(leg.ltp),
        volume=_f(leg.volume),
        oi=_f(leg.oi),
        oi_change=_f(leg.oi_change),
        iv=_f(g.iv) if g else None,
        delta=_f(g.delta) if g else None,
        gamma=_f(g.gamma) if g else None,
        theta=_f(g.theta) if g else None,
        vega=_f(g.vega) if g else None,
    )


def option_chain_to_response(chain: NormalizedOptionChain) -> OptionChainResponse:
    return OptionChainResponse(
        underlying=chain.underlying,
        spot=_f(chain.spot),
        futures=_f(chain.futures),
        atm_strike=_f(chain.atm_strike),
        expiry=chain.expiry,
        expiries=list(chain.expiries),
        rows=[
            OptionStrikeRow(
                strike=float(row.strike),
                moneyness=row.moneyness,
                call=_leg_to_schema(row.call),
                put=_leg_to_schema(row.put),
            )
            for row in chain.rows
        ],
        as_of=chain.as_of,
        source=chain.source,
        reference_note=chain.reference_note,
        latency=LatencyProbe(
            provider_ts=None,
            backend_received_at=chain.as_of,
            backend_sent_at=datetime.now(UTC),
            source=chain.provider,
            bottleneck="provider_feed",
        ),
    )
