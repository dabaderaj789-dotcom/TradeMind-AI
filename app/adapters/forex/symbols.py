"""Static forex / metals catalog."""

from __future__ import annotations

from decimal import Decimal

from app.adapters.forex.constants import EXCHANGE_CODE
from app.domain.entities.symbol import Symbol
from app.domain.enums.market_type import MarketType

# (symbol_code, name, yahoo_ticker, tick_size, market_type, base, quote)
# XAUUSD candles come from PAXGUSDT, which tracks the Gold Spot print.
_FOREX_CATALOG: list[tuple[str, str, str, str, MarketType, str, str]] = [
    (
        "XAUUSD",
        "Gold / USD",
        "PAXGUSDT",
        "0.01",
        MarketType.COMMODITY,
        "XAU",
        "USD",
    ),
]


def build_forex_symbols() -> list[Symbol]:
    out: list[Symbol] = []
    for code, name, yahoo, tick, mtype, base, quote in _FOREX_CATALOG:
        out.append(
            Symbol(
                symbol_code=code,
                name=name,
                exchange_code=EXCHANGE_CODE,
                market_type=mtype,
                base_asset=base,
                quote_asset=quote,
                tick_size=Decimal(tick),
                lot_size=1,
                is_active=True,
                metadata={
                    "yahoo_ticker": yahoo,
                    "instrument": "metal" if code.startswith("XAU") else "fx",
                    "display": code,
                },
            )
        )
    return out


def yahoo_ticker_for(symbol_code: str) -> str | None:
    for code, _n, yahoo, *_rest in _FOREX_CATALOG:
        if code.upper() == symbol_code.upper():
            return yahoo
    return None
