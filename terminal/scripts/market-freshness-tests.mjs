/**
 * Market-data freshness / tip-merge unit checks (no vitest in this package).
 * Run: node scripts/market-freshness-tests.mjs
 */
import assert from "node:assert/strict";

// Decision-table checks mirroring marketPrice.ts / liveCandle.ts.
// Source files are also typechecked via `npm run lint`.

const TF = { "1m": 60, "5m": 300, "15m": 900 };

function dataFreshness(asOfMs, timeframe, marketStatus, exchangeHint, opts = {}) {
  if (asOfMs == null) return { live: false, status: "UNAVAILABLE" };
  const now = opts.nowMs ?? Date.now();
  const age = Math.max(0, (now - asOfMs) / 1000);
  const source = (opts.quoteSource ?? "").toLowerCase();
  if (marketStatus === "CLOSED") return { live: false, status: "CLOSED", age };
  const tfSec = TF[timeframe] ?? 900;
  const tfMs = tfSec * 1000;
  const candleOpenMs = opts.candleOpenMs;
  if (candleOpenMs != null) {
    const currentOpen = Math.floor(now / tfMs) * tfMs;
    const lagBars = Math.max(0, Math.floor((currentOpen - candleOpenMs) / tfMs));
    if (lagBars > 2) return { live: false, status: "STALE", age, lagBars };
  }
  if (source === "yahoo_delayed" || source === "persisted_candles") {
    return { live: false, status: "STALE", age };
  }
  if (source === "yahoo_last") return { live: false, status: "DELAYED", age };
  if (source === "binance_ticker" || source === "gold_spot") {
    const max = source === "binance_ticker" ? 15 : 45;
    if (age <= max) return { live: true, status: "LIVE", age };
    return { live: false, status: "STALE", age };
  }
  return { live: false, status: "DELAYED", age };
}

function resolvePrice(quote, bars) {
  const last = bars.at(-1) ?? null;
  const quoteTs = quote ? Date.parse(quote.last_updated) : NaN;
  const candleTs = last ? Date.parse(last.close_time || last.open_time) : NaN;
  const now = Date.now();
  const cTs = Number.isFinite(candleTs) && candleTs > now + 2000 ? now : candleTs;
  const quoteOk = !!quote && quote.current_price > 0 && Number.isFinite(quoteTs);
  const candleOk = !!last && Number.isFinite(cTs);
  if (quoteOk && (!candleOk || quoteTs >= cTs - 500)) {
    return { price: quote.current_price, source: "quote" };
  }
  if (candleOk) return { price: Number(last.close), source: "candle" };
  return { price: null, source: null };
}

function shouldSkipTipInvent(lastOpenMs, barOpenMs, tfSec) {
  const gapBars = Math.floor((barOpenMs - lastOpenMs) / (tfSec * 1000));
  return gapBars > 1;
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("ok ", name);
  } catch (e) {
    console.error("FAIL", name, e.message);
    process.exitCode = 1;
  }
}

const now = Date.parse("2026-10-24T10:30:00Z");

check("India closed never LIVE", () => {
  const f = dataFreshness(now - 60_000, "15m", "CLOSED", "nse", {
    quoteSource: "yahoo_delayed",
    nowMs: now,
  });
  assert.equal(f.status, "CLOSED");
  assert.equal(f.live, false);
});

check("Yahoo last is DELAYED not LIVE", () => {
  const f = dataFreshness(now - 5_000, "5m", "OPEN", "nse", {
    quoteSource: "yahoo_last",
    candleOpenMs: now - 5 * 60_000,
    nowMs: now,
  });
  assert.equal(f.status, "DELAYED");
  assert.equal(f.live, false);
});

check("Binance fresh ticker is LIVE", () => {
  const f = dataFreshness(now - 3_000, "1m", "OPEN", "binance", {
    quoteSource: "binance_ticker",
    candleOpenMs: now - 60_000,
    nowMs: now,
  });
  assert.equal(f.status, "LIVE");
  assert.equal(f.live, true);
});

check("Binance old stamp is STALE", () => {
  const f = dataFreshness(now - 60_000, "1m", "OPEN", "binance", {
    quoteSource: "binance_ticker",
    candleOpenMs: now - 60_000,
    nowMs: now,
  });
  assert.equal(f.status, "STALE");
  assert.equal(f.live, false);
});

check("Gold quote LIVE but 8-day candle lag is STALE", () => {
  const f = dataFreshness(now - 2_000, "15m", "OPEN", "forex", {
    quoteSource: "gold_spot",
    candleOpenMs: Date.parse("2026-10-16T13:00:00Z"),
    nowMs: now,
  });
  assert.equal(f.status, "STALE");
  assert.equal(f.live, false);
});

check("Newer quote wins over older candle close", () => {
  const r = resolvePrice(
    { current_price: 4003.07, last_updated: "2026-10-24T10:25:00Z" },
    [{ close: 4166.65, close_time: "2026-10-16T13:14:59Z", open_time: "2026-10-16T13:00:00Z" }],
  );
  assert.equal(r.price, 4003.07);
  assert.equal(r.source, "quote");
});

check("Out-of-order older quote does not invent tip across multi-bar gap", () => {
  const lastOpen = Date.parse("2026-10-16T13:00:00Z");
  const barOpen = Date.parse("2026-10-24T10:15:00Z");
  assert.equal(shouldSkipTipInvent(lastOpen, barOpen, 900), true);
});

check("Single-bar gap still allows tip paint", () => {
  const lastOpen = Date.parse("2026-10-24T10:00:00Z");
  const barOpen = Date.parse("2026-10-24T10:15:00Z");
  assert.equal(shouldSkipTipInvent(lastOpen, barOpen, 900), false);
});

console.log(`\n${passed} checks passed`);
