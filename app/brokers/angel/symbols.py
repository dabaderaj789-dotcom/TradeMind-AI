"""Angel symbol-token map for TradeMind India underlyings.

Tokens are Angel SmartAPI instrument tokens (NSE indices / popular EQ).
Override or extend via ANGEL_SYMBOL_TOKENS JSON if Angel renumbers.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AngelInstrument:
    exchange: str
    tradingsymbol: str
    symboltoken: str


# Common Angel NSE index / EQ tokens (verify in Angel instrument master if LTP fails).
_DEFAULT: dict[str, AngelInstrument] = {
    "NIFTY": AngelInstrument("NSE", "NIFTY", "99926000"),
    "NIFTY50": AngelInstrument("NSE", "NIFTY", "99926000"),
    "BANKNIFTY": AngelInstrument("NSE", "BANKNIFTY", "99926009"),
    "FINNIFTY": AngelInstrument("NSE", "FINNIFTY", "99926037"),
    "MIDCPNIFTY": AngelInstrument("NSE", "MIDCPNIFTY", "99926074"),
    "SENSEX": AngelInstrument("BSE", "SENSEX", "99919000"),
    "RELIANCE": AngelInstrument("NSE", "RELIANCE-EQ", "2885"),
    "TCS": AngelInstrument("NSE", "TCS-EQ", "11536"),
    "INFY": AngelInstrument("NSE", "INFY-EQ", "1594"),
    "HDFCBANK": AngelInstrument("NSE", "HDFCBANK-EQ", "1333"),
}


def _overrides() -> dict[str, AngelInstrument]:
    raw = (os.environ.get("ANGEL_SYMBOL_TOKENS") or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    out: dict[str, AngelInstrument] = {}
    if not isinstance(data, dict):
        return out
    for code, meta in data.items():
        if not isinstance(meta, dict):
            continue
        out[str(code).upper()] = AngelInstrument(
            exchange=str(meta.get("exchange") or "NSE"),
            tradingsymbol=str(meta.get("tradingsymbol") or code),
            symboltoken=str(meta.get("symboltoken") or ""),
        )
    return {k: v for k, v in out.items() if v.symboltoken}


def resolve_angel_instrument(symbol_code: str) -> AngelInstrument | None:
    code = symbol_code.upper().replace(" ", "")
    merged = {**_DEFAULT, **_overrides()}
    return merged.get(code)
