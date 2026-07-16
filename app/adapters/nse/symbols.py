"""Static NSE symbol catalog (indices + Nifty 50 equities)."""

from __future__ import annotations

from decimal import Decimal

from app.adapters.nse.constants import EXCHANGE_CODE
from app.domain.entities.symbol import Symbol
from app.domain.enums.market_type import MarketType

# (symbol_code, name, yahoo_ticker, tick_size, lot_size, instrument)
_NSE_CATALOG: list[tuple[str, str, str, str, int, str]] = [
    ("NIFTY50", "Nifty 50", "^NSEI", "0.05", 25, "index"),
    ("BANKNIFTY", "Nifty Bank", "^NSEBANK", "0.05", 15, "index"),
    ("FINNIFTY", "Nifty Financial Services", "NIFTY_FIN_SERVICE.NS", "0.05", 25, "index"),
    ("SENSEX", "BSE Sensex", "^BSESN", "0.05", 10, "index"),
    ("RELIANCE", "Reliance Industries", "RELIANCE.NS", "0.05", 1, "equity"),
    ("TCS", "Tata Consultancy Services", "TCS.NS", "0.05", 1, "equity"),
    ("INFY", "Infosys", "INFY.NS", "0.05", 1, "equity"),
    ("HDFCBANK", "HDFC Bank", "HDFCBANK.NS", "0.05", 1, "equity"),
    ("ICICIBANK", "ICICI Bank", "ICICIBANK.NS", "0.05", 1, "equity"),
    ("SBIN", "State Bank of India", "SBIN.NS", "0.05", 1, "equity"),
    ("BHARTIARTL", "Bharti Airtel", "BHARTIARTL.NS", "0.05", 1, "equity"),
    ("ITC", "ITC Limited", "ITC.NS", "0.05", 1, "equity"),
    ("LT", "Larsen & Toubro", "LT.NS", "0.05", 1, "equity"),
    ("AXISBANK", "Axis Bank", "AXISBANK.NS", "0.05", 1, "equity"),
    ("KOTAKBANK", "Kotak Mahindra Bank", "KOTAKBANK.NS", "0.05", 1, "equity"),
    ("HINDUNILVR", "Hindustan Unilever", "HINDUNILVR.NS", "0.05", 1, "equity"),
    ("BAJFINANCE", "Bajaj Finance", "BAJFINANCE.NS", "0.05", 1, "equity"),
    ("MARUTI", "Maruti Suzuki India", "MARUTI.NS", "0.05", 1, "equity"),
    ("SUNPHARMA", "Sun Pharmaceutical", "SUNPHARMA.NS", "0.05", 1, "equity"),
    ("TATAMOTORS", "Tata Motors", "TATAMOTORS.NS", "0.05", 1, "equity"),
    ("WIPRO", "Wipro", "WIPRO.NS", "0.05", 1, "equity"),
    ("ULTRACEMCO", "UltraTech Cement", "ULTRACEMCO.NS", "0.05", 1, "equity"),
    ("ASIANPAINT", "Asian Paints", "ASIANPAINT.NS", "0.05", 1, "equity"),
    ("NESTLEIND", "Nestle India", "NESTLEIND.NS", "0.05", 1, "equity"),
    ("POWERGRID", "Power Grid Corporation", "POWERGRID.NS", "0.05", 1, "equity"),
    ("NTPC", "NTPC Limited", "NTPC.NS", "0.05", 1, "equity"),
    ("ONGC", "Oil & Natural Gas Corporation", "ONGC.NS", "0.05", 1, "equity"),
    ("TITAN", "Titan Company", "TITAN.NS", "0.05", 1, "equity"),
    ("ADANIENT", "Adani Enterprises", "ADANIENT.NS", "0.05", 1, "equity"),
    ("ADANIPORTS", "Adani Ports", "ADANIPORTS.NS", "0.05", 1, "equity"),
    ("JSWSTEEL", "JSW Steel", "JSWSTEEL.NS", "0.05", 1, "equity"),
    ("TATASTEEL", "Tata Steel", "TATASTEEL.NS", "0.05", 1, "equity"),
    ("TECHM", "Tech Mahindra", "TECHM.NS", "0.05", 1, "equity"),
    ("HCLTECH", "HCL Technologies", "HCLTECH.NS", "0.05", 1, "equity"),
    ("BAJAJFINSV", "Bajaj Finserv", "BAJAJFINSV.NS", "0.05", 1, "equity"),
    ("M&M", "Mahindra & Mahindra", "M&M.NS", "0.05", 1, "equity"),
    ("CIPLA", "Cipla", "CIPLA.NS", "0.05", 1, "equity"),
    ("DRREDDY", "Dr. Reddy's Laboratories", "DRREDDY.NS", "0.05", 1, "equity"),
    ("COALINDIA", "Coal India", "COALINDIA.NS", "0.05", 1, "equity"),
    ("BPCL", "Bharat Petroleum", "BPCL.NS", "0.05", 1, "equity"),
    ("EICHERMOT", "Eicher Motors", "EICHERMOT.NS", "0.05", 1, "equity"),
    ("HEROMOTOCO", "Hero MotoCorp", "HEROMOTOCO.NS", "0.05", 1, "equity"),
    ("INDUSINDBK", "IndusInd Bank", "INDUSINDBK.NS", "0.05", 1, "equity"),
    ("GRASIM", "Grasim Industries", "GRASIM.NS", "0.05", 1, "equity"),
    ("DIVISLAB", "Divi's Laboratories", "DIVISLAB.NS", "0.05", 1, "equity"),
    ("APOLLOHOSP", "Apollo Hospitals", "APOLLOHOSP.NS", "0.05", 1, "equity"),
    ("SBILIFE", "SBI Life Insurance", "SBILIFE.NS", "0.05", 1, "equity"),
    ("HDFCLIFE", "HDFC Life Insurance", "HDFCLIFE.NS", "0.05", 1, "equity"),
    ("BRITANNIA", "Britannia Industries", "BRITANNIA.NS", "0.05", 1, "equity"),
    ("TATACONSUM", "Tata Consumer Products", "TATACONSUM.NS", "0.05", 1, "equity"),
    ("BAJAJ-AUTO", "Bajaj Auto", "BAJAJ-AUTO.NS", "0.05", 1, "equity"),
    ("HINDALCO", "Hindalco Industries", "HINDALCO.NS", "0.05", 1, "equity"),
]


def build_nse_symbols() -> list[Symbol]:
    out: list[Symbol] = []
    for code, name, yahoo, tick, lot, instrument in _NSE_CATALOG:
        out.append(
            Symbol(
                symbol_code=code,
                name=name,
                exchange_code=EXCHANGE_CODE,
                market_type=MarketType.EQUITY,
                base_asset=code,
                quote_asset="INR",
                tick_size=Decimal(tick),
                lot_size=lot,
                is_active=True,
                metadata={"yahoo_ticker": yahoo, "instrument": instrument, "country": "IN"},
            )
        )
    return out


def yahoo_ticker_for(symbol_code: str) -> str | None:
    code = symbol_code.upper()
    for c, _n, yahoo, *_rest in _NSE_CATALOG:
        if c.upper() == code:
            return yahoo
    # Allow passthrough of Yahoo-style codes
    if code.endswith(".NS") or code.startswith("^"):
        return symbol_code
    return f"{code}.NS"
