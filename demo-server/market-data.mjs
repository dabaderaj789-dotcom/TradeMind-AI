/**
 * Live / historical OHLCV from public data providers.
 * Crypto → Binance Spot (same feed TradingView Binance charts use).
 * India  → Yahoo Finance NSE/BSE tickers (same feed TV India charts commonly use).
 *
 * Licensing: public REST APIs only — we do not scrape TradingView proprietary data.
 */

const TF_SECONDS = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Map TradeMind NSE codes → Yahoo Finance tickers. */
export const YAHOO_TICKERS = {
  NIFTY50: "^NSEI",
  BANKNIFTY: "^NSEBANK",
  FINNIFTY: "NIFTY_FIN_SERVICE.NS",
  SENSEX: "^BSESN",
  RELIANCE: "RELIANCE.NS",
  TCS: "TCS.NS",
  INFY: "INFY.NS",
  HDFCBANK: "HDFCBANK.NS",
  ICICIBANK: "ICICIBANK.NS",
  SBIN: "SBIN.NS",
  BHARTIARTL: "BHARTIARTL.NS",
  ITC: "ITC.NS",
  LT: "LT.NS",
  AXISBANK: "AXISBANK.NS",
  KOTAKBANK: "KOTAKBANK.NS",
  HINDUNILVR: "HINDUNILVR.NS",
  BAJFINANCE: "BAJFINANCE.NS",
  MARUTI: "MARUTI.NS",
  SUNPHARMA: "SUNPHARMA.NS",
  TATAMOTORS: "TATAMOTORS.NS",
  WIPRO: "WIPRO.NS",
  ULTRACEMCO: "ULTRACEMCO.NS",
  ASIANPAINT: "ASIANPAINT.NS",
  NESTLEIND: "NESTLEIND.NS",
  POWERGRID: "POWERGRID.NS",
};

const BINANCE_INTERVAL = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

const YAHOO_INTERVAL = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "4h": "60m", // resampled to 4h below
  "1d": "1d",
  "1w": "1wk",
};

function roundPrice(p) {
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8;
  return Number(p.toFixed(d));
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function barFrom(openMs, seconds, o, h, l, c, v) {
  return {
    time: Math.floor(openMs / 1000),
    open_time: iso(openMs),
    close_time: iso(openMs + seconds * 1000 - 1),
    open: roundPrice(o),
    high: roundPrice(h),
    low: roundPrice(l),
    close: roundPrice(c),
    volume: Number(Number(v).toFixed(2)),
  };
}

async function fetchJson(url, { headers } = {}) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TradeMindAI/1.0 (market-data)",
      ...headers,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Binance klines → bars. */
export async function fetchBinanceCandles(symbolCode, tf, limit = 400) {
  const interval = BINANCE_INTERVAL[tf] ?? "1h";
  const seconds = TF_SECONDS[tf] ?? 3600;
  const url = `${BINANCE_KLINES}?symbol=${encodeURIComponent(symbolCode)}&interval=${interval}&limit=${Math.min(1000, limit)}`;
  const raw = await fetchJson(url);
  if (!Array.isArray(raw)) throw new Error("Unexpected Binance response");
  return raw.map((k) =>
    barFrom(Number(k[0]), seconds, Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])),
  );
}

function resampleTo4h(bars1h) {
  const seconds = 14400;
  const groups = new Map();
  for (const b of bars1h) {
    const openMs = Math.floor(new Date(b.open_time).getTime() / (seconds * 1000)) * seconds * 1000;
    const g = groups.get(openMs);
    if (!g) {
      groups.set(openMs, {
        openMs,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      });
    } else {
      g.high = Math.max(g.high, b.high);
      g.low = Math.min(g.low, b.low);
      g.close = b.close;
      g.volume += b.volume;
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.openMs - b.openMs)
    .map((g) => barFrom(g.openMs, seconds, g.open, g.high, g.low, g.close, g.volume));
}

/** Yahoo chart → bars (NSE / BSE). */
export async function fetchYahooCandles(yahooTicker, tf, limit = 400) {
  const interval = YAHOO_INTERVAL[tf] ?? "60m";
  const seconds = TF_SECONDS[tf] ?? 3600;
  const rangeSec = seconds * Math.max(limit + 20, 80);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - rangeSec;
  const url =
    `${YAHOO_CHART}/${encodeURIComponent(yahooTicker)}` +
    `?interval=${interval}&period1=${period1}&period2=${period2}&includePrePost=false`;
  const body = await fetchJson(url);
  const result = body?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error(`No Yahoo data for ${yahooTicker}`);
  const q = result.indicators?.quote?.[0] ?? {};
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    const v = q.volume?.[i] ?? 0;
    if (o == null || h == null || l == null || c == null) continue;
    const openMs = result.timestamp[i] * 1000;
    bars.push(barFrom(openMs, seconds === 14400 ? 3600 : seconds, o, h, l, c, v));
  }
  if (tf === "4h") return resampleTo4h(bars).slice(-limit);
  return bars.slice(-limit);
}

/**
 * Resolve candles for a TradeMind symbol.
 * @returns {{ bars, source, providerLabel, yahooTicker?: string }}
 */
export async function fetchMarketCandles(symbol, tf, limit = 400) {
  if (symbol.exchange === "binance" || symbol.market_type === "crypto") {
    const bars = await fetchBinanceCandles(symbol.symbol_code, tf, limit);
    return {
      bars,
      source: "binance",
      providerLabel: "Binance Spot",
      referenceNote: "Matches TradingView BINANCE:SYMBOL chart feed (public API).",
    };
  }
  const yahoo =
    symbol.yahooTicker || YAHOO_TICKERS[symbol.symbol_code] || `${symbol.symbol_code}.NS`;
  const bars = await fetchYahooCandles(yahoo, tf, limit);
  return {
    bars,
    source: "yahoo",
    providerLabel: "Yahoo Finance (NSE)",
    yahooTicker: yahoo,
    referenceNote: "Matches TradingView NSE/Yahoo India charts (public Yahoo chart API).",
  };
}

/**
 * Side-by-side compare our served bars vs a fresh provider pull.
 */
export function compareOhlc(ours, reference, { priceTolPct = 0.0001, timeTolSec = 1, volumeTolPct = 0.02 } = {}) {
  const n = Math.min(ours.length, reference.length);
  const ourSlice = ours.slice(-n);
  const refSlice = reference.slice(-n);
  const rows = [];
  let mismatches = 0;
  for (let i = 0; i < n; i++) {
    const a = ourSlice[i];
    const b = refSlice[i];
    const tDiff = Math.abs(a.time - b.time);
    const fields = ["open", "high", "low", "close"];
    const diffs = {};
    let rowMismatch = tDiff > timeTolSec;
    for (const f of fields) {
      const d = a[f] - b[f];
      const pct = b[f] !== 0 ? Math.abs(d / b[f]) : Math.abs(d);
      diffs[f] = { ours: a[f], reference: b[f], abs: Number(d.toFixed(8)), pct };
      if (pct > priceTolPct) rowMismatch = true;
    }
    // Volume — compare when both sides have non-zero data
    const volA = a.volume ?? 0;
    const volB = b.volume ?? 0;
    if (volA > 0 && volB > 0) {
      const volPct = Math.abs(volA - volB) / volB;
      diffs.volume = { ours: volA, reference: volB, abs: Number((volA - volB).toFixed(4)), pct: volPct };
      if (volPct > volumeTolPct) rowMismatch = true;
    } else {
      diffs.volume = { ours: volA, reference: volB, abs: 0, pct: 0, skipped: true };
    }
    if (rowMismatch) mismatches++;
    rows.push({
      index: i,
      open_time: a.open_time,
      time_diff_sec: tDiff,
      mismatch: rowMismatch,
      ...diffs,
    });
  }
  return {
    compared: n,
    mismatches,
    match_rate: n ? Number((((n - mismatches) / n) * 100).toFixed(2)) : 0,
    price_tolerance_pct: priceTolPct * 100,
    volume_tolerance_pct: volumeTolPct * 100,
    time_tolerance_sec: timeTolSec,
    rows: rows.slice(-40),
  };
}
