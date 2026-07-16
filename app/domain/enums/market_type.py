"""Market asset class enumeration."""

from enum import StrEnum


class MarketType(StrEnum):
    EQUITY = "equity"
    CRYPTO = "crypto"
    FOREX = "forex"
    COMMODITY = "commodity"
    FUTURES = "futures"
    OPTIONS = "options"
