"""Yahoo / NSE public bridge — current default India live + option chain provider.

Keeps TradeMind working without broker credentials while the abstraction is live.
Replace via MARKET_DATA_INDIA_PROVIDER=angel|upstox|dhan|... when ready.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
from loguru import logger

from app.adapters.nse.client import NseYahooClient
from app.adapters.nse.symbols import yahoo_ticker_for
from app.providers._helpers import build_option_strike, dec, leg_from_fields
from app.providers.base import MarketDataProvider
from app.providers.errors import ProviderUpstreamError
from app.providers.types import (
    InstrumentMetadata,
    NormalizedOptionChain,
    NormalizedTick,
    ProviderCapability,
    ProviderHealth,
    ProviderId,
)

_CAPS = frozenset(
    {
        ProviderCapability.TICKS,
        ProviderCapability.OHLC,
        ProviderCapability.VOLUME,
        ProviderCapability.OPTION_CHAIN,
        ProviderCapability.OI,
        ProviderCapability.INSTRUMENTS,
    }
)

_OPTION_UNDERLYINGS = {
    "NIFTY": "NIFTY",
    "NIFTY50": "NIFTY",
    "BANKNIFTY": "BANKNIFTY",
    "FINNIFTY": "FINNIFTY",
    "MIDCPNIFTY": "MIDCPNIFTY",
    # BSE index — not on NSE public option-chain-v3
    "SENSEX": "SENSEX",
}

# NSE option-chain-v3 bid/ask renamed from bidPrice/askPrice.
def _leg_bid(leg: dict[str, Any]) -> Any:
    return leg.get("buyPrice1") or leg.get("bidprice") or leg.get("bidPrice")


def _leg_ask(leg: dict[str, Any]) -> Any:
    return leg.get("sellPrice1") or leg.get("askPrice") or leg.get("askprice")


def _row_expiry(row: dict[str, Any]) -> str | None:
    """v3 rows use expiryDates; legacy used expiryDate."""
    raw = row.get("expiryDates") or row.get("expiryDate")
    if raw is None:
        return None
    return str(raw)


def _india_session_open() -> bool:
    now = datetime.now(UTC)
    ist = now + timedelta(hours=5, minutes=30)
    mins = ist.hour * 60 + ist.minute
    return ist.weekday() < 5 and (9 * 60 + 15) <= mins < (15 * 60 + 30)


class YahooNseProvider(MarketDataProvider):
    """Public Yahoo/NSE REST — not exchange tick WebSocket."""

    def __init__(self) -> None:
        self._client = NseYahooClient()

    @property
    def provider_id(self) -> str:
        return ProviderId.YAHOO_NSE.value

    @property
    def display_name(self) -> str:
        return "Yahoo / NSE Public"

    @property
    def capabilities(self) -> frozenset[ProviderCapability]:
        return _CAPS

    async def get_tick(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> NormalizedTick:
        in_session = _india_session_open()
        status: str = "OPEN" if in_session else "CLOSED"
        yahoo = yahoo_ticker_for(symbol_code)
        if not yahoo or not in_session:
            raise ProviderUpstreamError(
                self.provider_id,
                detail=f"No live quote for {symbol_code} (session={in_session}, yahoo={yahoo})",
            )
        live = await self._client.get_last_price(yahoo)
        if not live:
            raise ProviderUpstreamError(self.provider_id, detail=f"Empty last price for {yahoo}")
        price, ts = live
        return NormalizedTick(
            symbol_code=symbol_code,
            last=Decimal(str(price)),
            timestamp=ts,
            exchange=(exchange or "nse").lower(),
            provider=self.provider_id,
            source="nse_india_or_yahoo",
            market_status=status,  # type: ignore[arg-type]
        )

    async def get_option_chain(
        self,
        underlying: str,
        *,
        expiry: str | None = None,
    ) -> NormalizedOptionChain:
        code = underlying.upper().replace(" ", "")
        nse_sym = _OPTION_UNDERLYINGS.get(code)
        if not nse_sym:
            raise ProviderUpstreamError(
                self.provider_id,
                detail=f"Unsupported underlying {underlying}; "
                f"supported={sorted(set(_OPTION_UNDERLYINGS.values()))}",
            )
        raw = await self._fetch_nse_option_chain(nse_sym, expiry=expiry)
        records = (raw.get("records") or {}) if isinstance(raw, dict) else {}
        data = records.get("data") or []
        expiries = [str(x) for x in (records.get("expiryDates") or [])]
        spot = dec(records.get("underlyingValue"))
        chosen = expiry or (expiries[0] if expiries else None)

        atm: Decimal | None = None
        if spot is not None and data:
            strikes = sorted(
                {s for s in (dec(r.get("strikePrice")) for r in data) if s is not None}
            )
            if strikes:
                atm = min(strikes, key=lambda s: abs(s - spot))

        rows = []
        for r in data:
            # v3 already scopes by expiry query param; still filter if row carries a date.
            row_exp = _row_expiry(r)
            if chosen and row_exp and row_exp != chosen:
                continue
            strike = dec(r.get("strikePrice"))
            if strike is None:
                continue
            ce = r.get("CE") or {}
            pe = r.get("PE") or {}
            rows.append(
                build_option_strike(
                    strike,
                    spot,
                    atm,
                    leg_from_fields(
                        strike,
                        "CE",
                        ltp=ce.get("lastPrice"),
                        bid=_leg_bid(ce),
                        ask=_leg_ask(ce),
                        volume=ce.get("totalTradedVolume"),
                        oi=ce.get("openInterest"),
                        oi_change=ce.get("changeinOpenInterest"),
                        iv=ce.get("impliedVolatility"),
                    ),
                    leg_from_fields(
                        strike,
                        "PE",
                        ltp=pe.get("lastPrice"),
                        bid=_leg_bid(pe),
                        ask=_leg_ask(pe),
                        volume=pe.get("totalTradedVolume"),
                        oi=pe.get("openInterest"),
                        oi_change=pe.get("changeinOpenInterest"),
                        iv=pe.get("impliedVolatility"),
                    ),
                )
            )
        rows.sort(key=lambda x: x.strike)
        return NormalizedOptionChain(
            underlying=nse_sym,
            as_of=datetime.now(UTC),
            spot=spot,
            atm_strike=atm,
            expiry=chosen,
            expiries=expiries,
            rows=rows,
            provider=self.provider_id,
            source="nseindia_option_chain_v3",
            reference_note=(
                "NSE India public option-chain-v3 REST (polled). Not exchange tick WebSocket. "
                "May lag Angel One; rate-limited; cookies required."
            ),
        )

    async def get_instrument(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> InstrumentMetadata | None:
        return InstrumentMetadata(
            symbol_code=symbol_code,
            name=symbol_code,
            exchange=(exchange or "nse").lower(),
            segment="INDEX" if symbol_code.upper() in _OPTION_UNDERLYINGS else "EQ",
            instrument_type="index" if symbol_code.upper() in _OPTION_UNDERLYINGS else "equity",
            provider=self.provider_id,
            tradingsymbol=symbol_code,
        )

    async def health_check(self) -> ProviderHealth:
        return ProviderHealth(
            provider=self.provider_id,
            status="ok",
            message="Public Yahoo/NSE bridge active",
            capabilities=tuple(sorted(c.value for c in _CAPS)),
        )

    async def _fetch_nse_option_chain(
        self,
        nse_sym: str,
        *,
        expiry: str | None = None,
    ) -> dict[str, Any]:
        """Fetch NSE public option chain via option-chain-v3.

        Legacy ``/api/option-chain-indices`` returns HTTP 404 (resource removed).
        Current flow: warm cookies → contract-info (expiries) → option-chain-v3.
        """
        if nse_sym == "SENSEX":
            raise ProviderUpstreamError(
                self.provider_id,
                detail="SENSEX options are on BSE; NSE public option-chain-v3 does not serve them",
            )
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "Referer": "https://www.nseindia.com/option-chain",
        }
        async with httpx.AsyncClient(timeout=25.0, headers=headers, follow_redirects=True) as client:
            await client.get("https://www.nseindia.com/")
            await client.get("https://www.nseindia.com/option-chain")

            info_resp = await client.get(
                "https://www.nseindia.com/api/option-chain-contract-info",
                params={"symbol": nse_sym},
            )
            if info_resp.status_code >= 400:
                logger.warning(
                    "NSE contract-info HTTP {}: {}",
                    info_resp.status_code,
                    info_resp.text[:200],
                )
                raise ProviderUpstreamError(
                    self.provider_id,
                    detail=f"NSE contract-info HTTP {info_resp.status_code}",
                )
            info = info_resp.json() if info_resp.content else {}
            expiries = [str(x) for x in (info.get("expiryDates") or [])]
            if not expiries:
                raise ProviderUpstreamError(
                    self.provider_id,
                    detail=f"NSE contract-info returned no expiries for {nse_sym}",
                )
            chosen = expiry if expiry in expiries else expiries[0]

            resp = await client.get(
                "https://www.nseindia.com/api/option-chain-v3",
                params={"type": "Indices", "symbol": nse_sym, "expiry": chosen},
            )
            if resp.status_code >= 400:
                logger.warning(
                    "NSE option-chain-v3 HTTP {}: {}",
                    resp.status_code,
                    resp.text[:200],
                )
                raise ProviderUpstreamError(
                    self.provider_id,
                    detail=f"NSE option-chain-v3 HTTP {resp.status_code}",
                )
            payload = resp.json()
            # Ensure expiry list is present even if records omit it.
            records = payload.get("records") if isinstance(payload, dict) else None
            if isinstance(records, dict):
                if not records.get("expiryDates"):
                    records["expiryDates"] = expiries
            return payload
