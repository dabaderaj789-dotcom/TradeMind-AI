#!/usr/bin/env node
/**
 * Node bootstrap for TradeMind FastAPI (when Python isn't available locally).
 * TRADEMIND_API_BASE=https://api.../api/v1 node scripts/bootstrap_market.mjs
 */
const BASE = (process.env.TRADEMIND_API_BASE || "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.BOOTSTRAP_TIMEOUT || 180) * 1000;

const CORE = [
  ["binance", "BTCUSDT"],
  ["binance", "ETHUSDT"],
  ["binance", "SOLUSDT"],
];
const OPTIONAL_NSE = [
  ["nse", "NIFTY50"],
  ["nse", "BANKNIFTY"],
];
const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const ANALYSIS_PLUGINS = [
  { plugin_id: "ema" },
  { plugin_id: "sma" },
  { plugin_id: "vwap" },
  { plugin_id: "rsi" },
  { plugin_id: "macd" },
  { plugin_id: "atr" },
  { plugin_id: "market_structure" },
  { plugin_id: "order_blocks" },
  { plugin_id: "fair_value_gaps" },
  { plugin_id: "liquidity_sweeps" },
];
const STRATEGIES = [
  "trend_continuation",
  "pullback",
  "breakout",
  "reversal",
  "range_rejection",
];

async function req(method, path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(t);
  }
}

const get = (path) => req("GET", path);
const post = (path, body) => req("POST", path, body);

async function findSymbol(exchange, code) {
  const data = await get(
    `/symbols?exchange_code=${exchange}&search=${code}&page_size=100&active_only=true`,
  );
  for (const item of data.items || []) {
    if (String(item.symbol_code || "").toUpperCase() === code.toUpperCase()) return item.id;
  }
  return null;
}

async function runPipeline(symbolId, code) {
  for (const tf of TIMEFRAMES) {
    console.log(`  [${code}] candles ${tf}`);
    await post("/candles/download", { symbol_id: symbolId, timeframe: tf, incremental: true });

    console.log(`  [${code}] analysis ${tf}`);
    await post("/analysis/execute", {
      symbol_id: symbolId,
      timeframe: tf,
      plugins: ANALYSIS_PLUGINS,
      candle_limit: 800,
      persist: true,
    });

    for (const [path, body] of [
      ["/market-structure/execute", { symbol_id: symbolId, timeframe: tf, persist: true }],
      ["/order-blocks/execute", { symbol_id: symbolId, timeframe: tf, persist: true }],
      ["/fair-value-gaps/execute", { symbol_id: symbolId, timeframe: tf, persist: true }],
      ["/liquidity-sweeps/execute", { symbol_id: symbolId, timeframe: tf, persist: true }],
      [
        "/trade-setups/execute",
        { symbol_id: symbolId, timeframe: tf, ensure_analysis: true, incremental: false },
      ],
    ]) {
      console.log(`  [${code}] ${path.split("/")[1]} ${tf}`);
      try {
        await post(path, body);
      } catch (e) {
        console.log(`  [warn] ${e.message}`);
      }
    }

    for (const sid of STRATEGIES) {
      try {
        await post("/strategies/execute", {
          symbol_id: symbolId,
          timeframe: tf,
          strategy_id: sid,
          setup_status: "active",
        });
        console.log(`  [${code}] strategy ${sid} ${tf}`);
      } catch (e) {
        console.log(`  [warn] strategy ${sid}: ${e.message}`);
      }
    }
  }
}

async function verify(symbolId) {
  const checks = [
    `/candles/${symbolId}/latest?timeframe=1h&limit=5`,
    `/quotes/${symbolId}`,
    `/market-structure/trend/${symbolId}?timeframe=1h`,
    `/order-blocks/active/${symbolId}?timeframe=1h`,
    `/fair-value-gaps/active/${symbolId}?timeframe=1h`,
    `/liquidity-sweeps/active/${symbolId}?timeframe=1h`,
    `/trade-setups/active/${symbolId}?timeframe=1h&limit=10`,
  ];
  for (const path of checks) {
    try {
      await get(path);
      console.log(`  [ok] GET ${path.split("?")[0]}`);
    } catch (e) {
      console.log(`  [warn] ${e.message}`);
    }
  }
}

async function main() {
  console.log(`TradeMind bootstrap → ${BASE}`);
  const health = await get("/health");
  console.log(`Health: ${health.status}`);

  console.log("Syncing Binance symbols…");
  await post("/symbols/sync", { exchange_code: "binance" });

  try {
    console.log("Syncing NSE symbols (optional)…");
    await post("/symbols/sync", { exchange_code: "nse" });
  } catch (e) {
    console.log(`[warn] NSE sync skipped: ${e.message}`);
  }

  for (const [exchange, code] of [...CORE, ...OPTIONAL_NSE]) {
    const sid = await findSymbol(exchange, code);
    if (!sid) {
      console.log(`[warn] ${code} not found — skip`);
      continue;
    }
    console.log(`\n=== Pipeline ${code} (${sid}) ===`);
    try {
      await runPipeline(sid, code);
      await verify(sid);
    } catch (e) {
      console.log(`[warn] ${code} pipeline failed (continuing): ${e.message}`);
    }
  }

  const strategies = await get("/strategies");
  console.log(`\nStrategies registry: ${strategies.total ?? 0} available`);
  console.log("\nBootstrap complete.");
}

main().catch((e) => {
  console.error(`[fail] ${e.message || e}`);
  process.exit(1);
});
