#!/usr/bin/env node
/**
 * Backfill candles for core symbols on the cloud API.
 * TRADEMIND_API_BASE=https://api.../api/v1 node scripts/backfill_candles.mjs
 */
const BASE = (process.env.TRADEMIND_API_BASE || "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.BOOTSTRAP_TIMEOUT || 300) * 1000;
const PAUSE_MS = Number(process.env.BACKFILL_PAUSE_MS || 2500);

const CORE = [
  ["binance", "BTCUSDT"],
  ["binance", "ETHUSDT"],
  ["binance", "SOLUSDT"],
  ["nse", "NIFTY50"],
  ["nse", "BANKNIFTY"],
];
const TIMEFRAMES = ["1d", "1h", "15m", "4h"]; // daily first (least Yahoo pressure)

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
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 400) };
    }
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findSymbol(exchange, code) {
  const data = await req(
    "GET",
    `/symbols?exchange_code=${exchange}&search=${encodeURIComponent(code)}&page_size=50&active_only=true`,
  );
  return (data.items || []).find((i) => String(i.symbol_code).toUpperCase() === code.toUpperCase()) || null;
}

async function candleCount(symbolId, tf) {
  const data = await req("GET", `/candles/${symbolId}/latest?timeframe=${tf}&limit=1`);
  // latest endpoint returns items; also hit list for total when possible
  try {
    const list = await req("GET", `/candles/${symbolId}?timeframe=${tf}&limit=1`);
    return Number(list.total ?? data.items?.length ?? 0);
  } catch {
    return Number(data.items?.length ?? 0);
  }
}

async function downloadWithRetry(symbolId, code, tf, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await req("POST", "/candles/download", {
        symbol_id: symbolId,
        timeframe: tf,
        incremental: true,
      });
      return result;
    } catch (e) {
      lastErr = e;
      const wait = Math.min(60_000, 2000 * 2 ** i);
      console.log(`  [retry ${i + 1}/${attempts}] ${code} ${tf}: ${e.message.slice(0, 160)} — wait ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`Backfill → ${BASE}`);
  const health = await req("GET", "/health");
  console.log(`Health: ${health.status}`);

  const report = [];

  for (const [exchange, code] of CORE) {
    const sym = await findSymbol(exchange, code);
    if (!sym) {
      console.log(`[miss] ${code} not in DB`);
      report.push({ code, exchange, status: "symbol_missing" });
      continue;
    }
    console.log(`\n=== ${code} (${sym.id}) ===`);
    for (const tf of TIMEFRAMES) {
      const before = await candleCount(sym.id, tf);
      if (before > 0) {
        console.log(`  [ok] ${tf} already has ${before} candles`);
        report.push({ code, tf, before, after: before, status: "present" });
        continue;
      }
      console.log(`  [fill] ${tf} empty — downloading…`);
      try {
        const result = await downloadWithRetry(sym.id, code, tf);
        await sleep(PAUSE_MS);
        const after = await candleCount(sym.id, tf);
        console.log(
          `  [done] ${tf} downloaded=${result.downloaded} inserted=${result.inserted} now=${after}`,
        );
        report.push({
          code,
          tf,
          before,
          after,
          downloaded: result.downloaded,
          inserted: result.inserted,
          status: after > 0 ? "filled" : "empty_after_download",
        });
      } catch (e) {
        console.log(`  [fail] ${tf}: ${e.message}`);
        report.push({ code, tf, before, after: 0, status: "failed", error: e.message.slice(0, 200) });
      }
    }
  }

  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  const missing = report.filter((r) => r.status === "failed" || r.status === "empty_after_download" || r.after === 0);
  if (missing.length) {
    console.error(`\nStill missing ${missing.length} symbol/TF pairs`);
    process.exit(1);
  }
  console.log("\nAll core symbol/timeframes have candles.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
