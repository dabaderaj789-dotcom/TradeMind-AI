"""Tests for Binance normalizer."""

from datetime import UTC, datetime
from decimal import Decimal

from app.adapters.binance.normalizer import normalize_kline, normalize_symbol, to_binance_interval


def test_normalize_symbol_usdt_pair() -> None:
    raw = {
        "symbol": "BTCUSDT",
        "status": "TRADING",
        "baseAsset": "BTC",
        "quoteAsset": "USDT",
        "filters": [
            {"filterType": "PRICE_FILTER", "tickSize": "0.01"},
            {"filterType": "LOT_SIZE", "minQty": "0.00001"},
        ],
    }
    symbol = normalize_symbol(raw)
    assert symbol is not None
    assert symbol.symbol_code == "BTCUSDT"
    assert symbol.base_asset == "BTC"
    assert symbol.quote_asset == "USDT"
    assert symbol.exchange_code == "binance"


def test_normalize_symbol_skips_non_usdt() -> None:
    raw = {"symbol": "ETHBTC", "status": "TRADING", "quoteAsset": "BTC", "filters": []}
    assert normalize_symbol(raw) is None


def test_normalize_kline() -> None:
    raw = [
        1499040000000,
        "0.01634790",
        "0.80000000",
        "0.01575800",
        "0.01577100",
        "148976.11427815",
        1499644799999,
        "2434.19055334",
        308,
        "0",
        "0",
        "0",
    ]
    candle = normalize_kline(raw, "BTCUSDT", "1h")
    assert candle.symbol_code == "BTCUSDT"
    assert candle.timeframe_code == "1h"
    assert candle.open == Decimal("0.01634790")
    assert candle.trades_count == 308
    assert candle.open_time == datetime.fromtimestamp(1499040000000 / 1000, tz=UTC)


def test_to_binance_interval() -> None:
    assert to_binance_interval("1h") == "1h"
    assert to_binance_interval("1d") == "1d"
