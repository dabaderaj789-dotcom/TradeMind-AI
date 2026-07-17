#!/usr/bin/env python3
"""Bootstrap FastAPI + Postgres for a fully usable Trading Terminal.

One command:
  python scripts/bootstrap_market.py

With remote API:
  TRADEMIND_API_BASE=https://your-api.onrender.com/api/v1 python scripts/bootstrap_market.py

Pipeline per core symbol:
  sync symbols → download candles → analysis plugins → market structure →
  order blocks → FVG → liquidity sweeps → trade setups → strategies
"""

from __future__ import annotations

import os
import sys

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx", file=sys.stderr)
    sys.exit(1)

BASE = os.environ.get("TRADEMIND_API_BASE", "http://127.0.0.1:8000/api/v1").rstrip("/")
TIMEOUT = float(os.environ.get("BOOTSTRAP_TIMEOUT", "180"))

CORE = [
    ("binance", "BTCUSDT"),
    ("binance", "ETHUSDT"),
    ("binance", "SOLUSDT"),
]

# Optional NSE indices when the NSE adapter has data
OPTIONAL_NSE = [
    ("nse", "NIFTY50"),
    ("nse", "BANKNIFTY"),
]

TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]

ANALYSIS_PLUGINS = [
    {"plugin_id": "ema"},
    {"plugin_id": "sma"},
    {"plugin_id": "vwap"},
    {"plugin_id": "rsi"},
    {"plugin_id": "macd"},
    {"plugin_id": "atr"},
    {"plugin_id": "market_structure"},
    {"plugin_id": "order_blocks"},
    {"plugin_id": "fair_value_gaps"},
    {"plugin_id": "liquidity_sweeps"},
]

STRATEGIES = [
    "trend_continuation",
    "pullback",
    "breakout",
    "reversal",
    "range_rejection",
]


def post(client: httpx.Client, path: str, body: dict) -> dict:
    r = client.post(f"{BASE}{path}", json=body, timeout=TIMEOUT)
    if r.status_code >= 400:
        raise RuntimeError(f"POST {path} → {r.status_code}: {r.text[:600]}")
    return r.json() if r.content else {}


def get(client: httpx.Client, path: str) -> dict:
    r = client.get(f"{BASE}{path}", timeout=TIMEOUT)
    if r.status_code >= 400:
        raise RuntimeError(f"GET {path} → {r.status_code}: {r.text[:600]}")
    return r.json()


def find_symbol(client: httpx.Client, exchange: str, code: str) -> str | None:
    data = get(
        client,
        f"/symbols?exchange_code={exchange}&search={code}&page_size=100&active_only=true",
    )
    for item in data.get("items", []):
        if item.get("symbol_code", "").upper() == code.upper():
            return item["id"]
    return None


def run_pipeline(client: httpx.Client, symbol_id: str, code: str) -> None:
    for tf in TIMEFRAMES:
        print(f"  [{code}] candles {tf}")
        post(
            client,
            "/candles/download",
            {"symbol_id": symbol_id, "timeframe": tf, "incremental": True},
        )

        print(f"  [{code}] analysis {tf}")
        post(
            client,
            "/analysis/execute",
            {
                "symbol_id": symbol_id,
                "timeframe": tf,
                "plugins": ANALYSIS_PLUGINS,
                "candle_limit": 800,
                "persist": True,
            },
        )

        for path, body in [
            ("/market-structure/execute", {"symbol_id": symbol_id, "timeframe": tf, "persist": True}),
            ("/order-blocks/execute", {"symbol_id": symbol_id, "timeframe": tf, "persist": True}),
            ("/fair-value-gaps/execute", {"symbol_id": symbol_id, "timeframe": tf, "persist": True}),
            ("/liquidity-sweeps/execute", {"symbol_id": symbol_id, "timeframe": tf, "persist": True}),
            (
                "/trade-setups/execute",
                {
                    "symbol_id": symbol_id,
                    "timeframe": tf,
                    "ensure_analysis": True,
                    "incremental": False,
                },
            ),
        ]:
            print(f"  [{code}] {path.split('/')[1]} {tf}")
            try:
                post(client, path, body)
            except RuntimeError as exc:
                print(f"  [warn] {exc}")

        for sid in STRATEGIES:
            try:
                post(
                    client,
                    "/strategies/execute",
                    {
                        "symbol_id": symbol_id,
                        "timeframe": tf,
                        "strategy_id": sid,
                        "setup_status": "active",
                    },
                )
                print(f"  [{code}] strategy {sid} {tf}")
            except RuntimeError as exc:
                print(f"  [warn] strategy {sid}: {exc}")


def verify_readable(client: httpx.Client, symbol_id: str, code: str) -> None:
    checks = [
        f"/candles/{symbol_id}/latest?timeframe=1h&limit=5",
        f"/quotes/{symbol_id}",
        f"/market-structure/trend/{symbol_id}?timeframe=1h",
        f"/order-blocks/active/{symbol_id}?timeframe=1h",
        f"/fair-value-gaps/active/{symbol_id}?timeframe=1h",
        f"/liquidity-sweeps/active/{symbol_id}?timeframe=1h",
        f"/trade-setups/active/{symbol_id}?timeframe=1h&limit=10",
    ]
    for path in checks:
        try:
            get(client, path)
            print(f"  [ok] GET {path.split('?')[0]}")
        except RuntimeError as exc:
            print(f"  [warn] {exc}")


def main() -> int:
    print(f"TradeMind bootstrap → {BASE}")
    with httpx.Client() as client:
        health = get(client, "/health")
        print(f"Health: {health.get('status')}")

        print("Syncing Binance symbols…")
        post(client, "/symbols/sync", {"exchange_code": "binance"})

        try:
            print("Syncing NSE symbols (optional)…")
            post(client, "/symbols/sync", {"exchange_code": "nse"})
        except RuntimeError as exc:
            print(f"[warn] NSE sync skipped: {exc}")

        targets = list(CORE)
        for pair in OPTIONAL_NSE:
            targets.append(pair)

        for exchange, code in targets:
            sid = find_symbol(client, exchange, code)
            if not sid:
                print(f"[warn] {code} not found — skip")
                continue
            print(f"\n=== Pipeline {code} ({sid}) ===")
            run_pipeline(client, sid, code)
            verify_readable(client, sid, code)

        print("\nStrategies registry:")
        strategies = get(client, "/strategies")
        print(f"  {strategies.get('total', 0)} strategies available")

        cal = get(client, "/calendar/events")
        print(f"Calendar events today: {cal.get('total', 0)} (empty until a provider is wired)")

    print("\nBootstrap complete — Terminal can open charts against FastAPI.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
