// TradeMind AI — Market analysis engine (Node demo backend).
//
// Prefers live public market data (Binance / Yahoo) for OHLCV accuracy.
// Falls back to deterministic synthetic candles only when the network feed fails.
// Smart Money objects are computed from the active candle series and filtered
// for high-confidence / unmitigated / fresh structures only.

export const TF_SECONDS = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

// ---- deterministic RNG ---------------------------------------------------
function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- helpers -------------------------------------------------------------
function roundPrice(p) {
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8;
  return Number(p.toFixed(d));
}
const r2 = (x) => Number(x.toFixed(2));
const iso = (ms) => new Date(ms).toISOString();
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---- symbol universe -----------------------------------------------------
export const CRYPTO_SYMBOLS = [
  { id: "11111111-1111-4111-8111-111111111111", symbol_code: "BTCUSDT", name: "Bitcoin", base: "BTC", basePrice: 62000, vol: 0.012, baseVol: 1400, drift: 0.0004, exchange: "binance", market_type: "crypto", quote: "USDT" },
  { id: "22222222-2222-4222-8222-222222222222", symbol_code: "ETHUSDT", name: "Ethereum", base: "ETH", basePrice: 3100, vol: 0.015, baseVol: 11000, drift: 0.0003, exchange: "binance", market_type: "crypto", quote: "USDT" },
  { id: "33333333-3333-4333-8333-333333333333", symbol_code: "SOLUSDT", name: "Solana", base: "SOL", basePrice: 145, vol: 0.021, baseVol: 42000, drift: 0.0006, exchange: "binance", market_type: "crypto", quote: "USDT" },
  { id: "44444444-4444-4444-8444-444444444444", symbol_code: "BNBUSDT", name: "BNB", base: "BNB", basePrice: 585, vol: 0.013, baseVol: 8000, drift: 0.0002, exchange: "binance", market_type: "crypto", quote: "USDT" },
  { id: "55555555-5555-4555-8555-555555555555", symbol_code: "XRPUSDT", name: "XRP", base: "XRP", basePrice: 0.52, vol: 0.02, baseVol: 520000, drift: -0.0002, exchange: "binance", market_type: "crypto", quote: "USDT" },
  { id: "66666666-6666-4666-8666-666666666666", symbol_code: "ADAUSDT", name: "Cardano", base: "ADA", basePrice: 0.45, vol: 0.022, baseVol: 780000, drift: -0.0003, exchange: "binance", market_type: "crypto", quote: "USDT" },
  { id: "77777777-7777-4777-8777-777777777777", symbol_code: "DOGEUSDT", name: "Dogecoin", base: "DOGE", basePrice: 0.12, vol: 0.028, baseVol: 2100000, drift: 0.0005, exchange: "binance", market_type: "crypto", quote: "USDT" },
  { id: "88888888-8888-4888-8888-888888888888", symbol_code: "AVAXUSDT", name: "Avalanche", base: "AVAX", basePrice: 27, vol: 0.02, baseVol: 60000, drift: 0.0003, exchange: "binance", market_type: "crypto", quote: "USDT" },
];

/** NSE indices + equities — yahooTicker maps to public Yahoo chart symbols. */
export const NSE_SYMBOLS = [
  { id: "a1111111-nse0-4111-8111-000000000001", symbol_code: "NIFTY50", name: "Nifty 50", base: "NIFTY", basePrice: 24850, vol: 0.007, baseVol: 280000, drift: 0.00025, exchange: "nse", market_type: "equity", quote: "INR", instrument: "index", yahooTicker: "^NSEI" },
  { id: "a1111111-nse0-4111-8111-000000000002", symbol_code: "BANKNIFTY", name: "Nifty Bank", base: "BANKNIFTY", basePrice: 52350, vol: 0.009, baseVol: 210000, drift: 0.00028, exchange: "nse", market_type: "equity", quote: "INR", instrument: "index", yahooTicker: "^NSEBANK" },
  { id: "a1111111-nse0-4111-8111-000000000003", symbol_code: "FINNIFTY", name: "Nifty Financial Services", base: "FINNIFTY", basePrice: 23680, vol: 0.008, baseVol: 95000, drift: 0.00022, exchange: "nse", market_type: "equity", quote: "INR", instrument: "index", yahooTicker: "NIFTY_FIN_SERVICE.NS" },
  { id: "a1111111-nse0-4111-8111-000000000004", symbol_code: "SENSEX", name: "BSE Sensex", base: "SENSEX", basePrice: 81720, vol: 0.0065, baseVol: 120000, drift: 0.0002, exchange: "nse", market_type: "equity", quote: "INR", instrument: "index", yahooTicker: "^BSESN" },
  { id: "a1111111-nse0-4111-8111-000000000010", symbol_code: "RELIANCE", name: "Reliance Industries", base: "RELIANCE", basePrice: 2985, vol: 0.011, baseVol: 4200000, drift: 0.0003, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "RELIANCE.NS" },
  { id: "a1111111-nse0-4111-8111-000000000011", symbol_code: "TCS", name: "Tata Consultancy Services", base: "TCS", basePrice: 4120, vol: 0.01, baseVol: 1800000, drift: 0.00018, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "TCS.NS" },
  { id: "a1111111-nse0-4111-8111-000000000012", symbol_code: "INFY", name: "Infosys", base: "INFY", basePrice: 1865, vol: 0.012, baseVol: 5100000, drift: 0.0002, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "INFY.NS" },
  { id: "a1111111-nse0-4111-8111-000000000013", symbol_code: "HDFCBANK", name: "HDFC Bank", base: "HDFCBANK", basePrice: 1728, vol: 0.01, baseVol: 6200000, drift: 0.00015, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "HDFCBANK.NS" },
  { id: "a1111111-nse0-4111-8111-000000000014", symbol_code: "ICICIBANK", name: "ICICI Bank", base: "ICICIBANK", basePrice: 1245, vol: 0.011, baseVol: 7800000, drift: 0.00022, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "ICICIBANK.NS" },
  { id: "a1111111-nse0-4111-8111-000000000015", symbol_code: "SBIN", name: "State Bank of India", base: "SBIN", basePrice: 845, vol: 0.013, baseVol: 9500000, drift: 0.00025, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "SBIN.NS" },
  { id: "a1111111-nse0-4111-8111-000000000016", symbol_code: "BHARTIARTL", name: "Bharti Airtel", base: "BHARTIARTL", basePrice: 1620, vol: 0.012, baseVol: 3100000, drift: 0.0003, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "BHARTIARTL.NS" },
  { id: "a1111111-nse0-4111-8111-000000000017", symbol_code: "ITC", name: "ITC Limited", base: "ITC", basePrice: 468, vol: 0.01, baseVol: 11000000, drift: 0.0001, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "ITC.NS" },
  { id: "a1111111-nse0-4111-8111-000000000018", symbol_code: "LT", name: "Larsen & Toubro", base: "LT", basePrice: 3625, vol: 0.011, baseVol: 1400000, drift: 0.00028, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "LT.NS" },
  { id: "a1111111-nse0-4111-8111-000000000019", symbol_code: "AXISBANK", name: "Axis Bank", base: "AXISBANK", basePrice: 1188, vol: 0.012, baseVol: 5600000, drift: 0.0002, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "AXISBANK.NS" },
  { id: "a1111111-nse0-4111-8111-000000000020", symbol_code: "KOTAKBANK", name: "Kotak Mahindra Bank", base: "KOTAKBANK", basePrice: 1925, vol: 0.011, baseVol: 2400000, drift: 0.00012, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "KOTAKBANK.NS" },
  { id: "a1111111-nse0-4111-8111-000000000021", symbol_code: "HINDUNILVR", name: "Hindustan Unilever", base: "HINDUNILVR", basePrice: 2680, vol: 0.009, baseVol: 1300000, drift: 0.00008, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "HINDUNILVR.NS" },
  { id: "a1111111-nse0-4111-8111-000000000022", symbol_code: "BAJFINANCE", name: "Bajaj Finance", base: "BAJFINANCE", basePrice: 7850, vol: 0.014, baseVol: 900000, drift: 0.00035, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "BAJFINANCE.NS" },
  { id: "a1111111-nse0-4111-8111-000000000023", symbol_code: "MARUTI", name: "Maruti Suzuki India", base: "MARUTI", basePrice: 12640, vol: 0.012, baseVol: 450000, drift: 0.0002, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "MARUTI.NS" },
  { id: "a1111111-nse0-4111-8111-000000000024", symbol_code: "SUNPHARMA", name: "Sun Pharmaceutical", base: "SUNPHARMA", basePrice: 1725, vol: 0.011, baseVol: 2100000, drift: 0.00018, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "SUNPHARMA.NS" },
  { id: "a1111111-nse0-4111-8111-000000000025", symbol_code: "TATAMOTORS", name: "Tata Motors", base: "TATAMOTORS", basePrice: 975, vol: 0.016, baseVol: 14000000, drift: 0.0004, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "TATAMOTORS.NS" },
  { id: "a1111111-nse0-4111-8111-000000000026", symbol_code: "WIPRO", name: "Wipro", base: "WIPRO", basePrice: 512, vol: 0.013, baseVol: 7200000, drift: 0.00015, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "WIPRO.NS" },
  { id: "a1111111-nse0-4111-8111-000000000027", symbol_code: "ULTRACEMCO", name: "UltraTech Cement", base: "ULTRACEMCO", basePrice: 11480, vol: 0.011, baseVol: 380000, drift: 0.00022, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "ULTRACEMCO.NS" },
  { id: "a1111111-nse0-4111-8111-000000000028", symbol_code: "ASIANPAINT", name: "Asian Paints", base: "ASIANPAINT", basePrice: 2485, vol: 0.01, baseVol: 980000, drift: 0.0001, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "ASIANPAINT.NS" },
  { id: "a1111111-nse0-4111-8111-000000000029", symbol_code: "NESTLEIND", name: "Nestle India", base: "NESTLEIND", basePrice: 2380, vol: 0.009, baseVol: 420000, drift: 0.0001, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "NESTLEIND.NS" },
  { id: "a1111111-nse0-4111-8111-000000000030", symbol_code: "POWERGRID", name: "Power Grid Corporation", base: "POWERGRID", basePrice: 328, vol: 0.011, baseVol: 9500000, drift: 0.00018, exchange: "nse", market_type: "equity", quote: "INR", instrument: "equity", yahooTicker: "POWERGRID.NS" },
];

export const SYMBOLS = [...CRYPTO_SYMBOLS, ...NSE_SYMBOLS];

export const EXCHANGES = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    code: "binance",
    name: "Binance Spot",
    country: "Global",
    timezone: "UTC",
    market_types: ["crypto"],
    is_active: true,
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000002",
    code: "nse",
    name: "National Stock Exchange of India",
    country: "India",
    timezone: "Asia/Kolkata",
    market_types: ["equity", "futures", "options"],
    is_active: true,
  },
];

/** @deprecated use EXCHANGES — kept for older imports */
export const EXCHANGE = EXCHANGES[0];

export function symbolResponse(s) {
  const isNse = s.exchange === "nse";
  return {
    id: s.id,
    exchange_code: isNse ? "nse" : "binance",
    exchange_name: isNse ? "National Stock Exchange of India" : "Binance Spot",
    market_code: isNse ? "nse_equity" : "binance_crypto",
    market_type: s.market_type,
    symbol_code: s.symbol_code,
    code: s.symbol_code,
    name: isNse ? `${s.name} · NSE` : `${s.name} / TetherUS`,
    base_asset: s.base,
    quote_asset: s.quote,
    tick_size: s.basePrice >= 1000 ? 0.05 : s.basePrice >= 1 ? 0.05 : 0.01,
    lot_size: isNse && s.instrument === "index" ? 25 : 1,
    is_active: true,
    instrument: s.instrument ?? s.market_type,
  };
}

// ---- indicators ----------------------------------------------------------
function ema(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (prev === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}
function sma(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out[i] = sum / period;
  }
  return out;
}
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
function macd(closes) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = closes.map((_, i) => (fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null));
  const valid = line.map((v) => (v == null ? 0 : v));
  const signalRaw = ema(valid, 9);
  const out = closes.map((_, i) => {
    if (line[i] == null) return { macd: null, signal: null, histogram: null };
    const sig = signalRaw[i];
    return { macd: line[i], signal: sig, histogram: sig != null ? line[i] - sig : null };
  });
  return out;
}
function atr(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  const tr = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  let prev = null;
  for (let i = 0; i < bars.length; i++) {
    if (i < period) continue;
    if (prev === null) {
      let sum = 0;
      for (let j = 1; j <= period; j++) sum += tr[j];
      prev = sum / period;
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
    }
    out[i] = prev;
  }
  return out;
}
function vwap(bars) {
  let cumPV = 0;
  let cumV = 0;
  return bars.map((b) => {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
    return cumV > 0 ? cumPV / cumV : b.close;
  });
}

// ---- candle generation (offline fallback only) ---------------------------
function genCandles(symbol, tf, count = 400) {
  const seconds = TF_SECONDS[tf] ?? 3600;
  const rng = mulberry32(xfnv1a(`${symbol.id}:${tf}:candles`));
  const now = Date.now();
  const alignedEnd = Math.floor(now / (seconds * 1000)) * seconds * 1000;
  const startMs = alignedEnd - (count - 1) * seconds * 1000;
  let price = symbol.basePrice * (0.85 + rng() * 0.3);
  let bias = symbol.drift + (rng() - 0.5) * 0.0008;
  let regimeLen = 25 + Math.floor(rng() * 45);
  const bars = [];
  for (let i = 0; i < count; i++) {
    if (i % regimeLen === 0) {
      bias = symbol.drift + (rng() - 0.5) * 0.0016;
      regimeLen = 25 + Math.floor(rng() * 45);
    }
    const t = startMs + i * seconds * 1000;
    const shock = (rng() - 0.5) * symbol.vol * 2;
    const change = bias + shock;
    const open = price;
    let close = Math.max(0.00001, open * (1 + change));
    const wick = symbol.vol * (0.3 + rng() * 0.7);
    const high = Math.max(open, close) * (1 + rng() * wick);
    const low = Math.min(open, close) * (1 - rng() * wick);
    const volume = symbol.baseVol * (0.5 + rng() * 1.4) * (1 + Math.abs(change) * 20);
    bars.push({
      time: Math.floor(t / 1000),
      open_time: iso(t),
      close_time: iso(t + seconds * 1000 - 1),
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
      volume: r2(volume),
    });
    price = close;
  }
  return bars;
}

/** Prefer live provider candles; synthetic only if the feed is unreachable. */
async function loadCandles(symbol, tf, count = 400) {
  try {
    const { fetchMarketCandles } = await import("./market-data.mjs");
    const live = await fetchMarketCandles(symbol, tf, count);
    if (live.bars?.length >= 30) {
      return {
        bars: live.bars,
        source: live.source,
        providerLabel: live.providerLabel,
        referenceNote: live.referenceNote,
        yahooTicker: live.yahooTicker,
      };
    }
  } catch (err) {
    console.warn(`[data] live candles failed for ${symbol.symbol_code} ${tf}:`, err?.message ?? err);
  }
  return {
    bars: genCandles(symbol, tf, count),
    source: "synthetic",
    providerLabel: "Synthetic fallback",
    referenceNote: "Offline fallback — not exchange-accurate.",
  };
}

// ---- market structure ----------------------------------------------------
function pivots(bars, k = 3) {
  const highs = [];
  const lows = [];
  for (let i = k; i < bars.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) highs.push(i);
    if (isLow) lows.push(i);
  }
  return { highs, lows };
}

function marketStructure(symbol, tf, bars) {
  const { highs, lows } = pivots(bars);
  const swings = [];
  for (const i of highs) swings.push({ i, kind: "high", price: bars[i].high });
  for (const i of lows) swings.push({ i, kind: "low", price: bars[i].low });
  swings.sort((a, b) => a.i - b.i);

  // classify HH/HL/LH/LL
  let lastHigh = null;
  let lastLow = null;
  for (const sw of swings) {
    if (sw.kind === "high") {
      sw.label = lastHigh == null ? "HH" : sw.price >= lastHigh ? "HH" : "LH";
      lastHigh = sw.price;
    } else {
      sw.label = lastLow == null ? "HL" : sw.price >= lastLow ? "HL" : "LL";
      lastLow = sw.price;
    }
  }

  // trend from last two highs & lows
  const recentHighs = swings.filter((s) => s.kind === "high").slice(-2);
  const recentLows = swings.filter((s) => s.kind === "low").slice(-2);
  let trend = "sideways";
  if (recentHighs.length === 2 && recentLows.length === 2) {
    const hh = recentHighs[1].price > recentHighs[0].price;
    const hl = recentLows[1].price > recentLows[0].price;
    const lh = recentHighs[1].price < recentHighs[0].price;
    const ll = recentLows[1].price < recentLows[0].price;
    if (hh && hl) trend = "bullish";
    else if (lh && ll) trend = "bearish";
  }
  // Confidence from structure clarity — not random.
  let confidence = 50;
  if (trend === "bullish" || trend === "bearish") {
    const span =
      recentHighs.length === 2
        ? Math.abs(recentHighs[1].price - recentHighs[0].price) / recentHighs[0].price
        : 0;
    confidence = clamp(62 + span * 800, 62, 88);
  } else {
    confidence = 48;
  }
  const phases = trend === "sideways" ? ["ranging"] : ["trending"];
  const market_phase = phases[0];
  const phase_confidence = trend === "sideways" ? 55 : r2(confidence - 4);

  // BOS / CHoCH — keep newest high-quality break only (chart clarity).
  const bos_events = [];
  const choch_events = [];
  let prevBreakDir = null;
  const highPivots = swings.filter((s) => s.kind === "high");
  const lowPivots = swings.filter((s) => s.kind === "low");
  for (const sw of highPivots.slice(-8)) {
    for (let j = sw.i + 1; j < bars.length; j++) {
      if (bars[j].close > sw.price) {
        const body = Math.abs(bars[j].close - bars[j].open);
        const range = bars[j].high - bars[j].low || 1;
        if (body / range < 0.35) break; // weak close-through — skip
        const ev = {
          event_type: "bos_bullish",
          broken_swing_price: roundPrice(sw.price),
          break_price: roundPrice(bars[j].close),
          break_time: bars[j].open_time,
          open_time: bars[sw.i].open_time,
          confidence: r2(68 + (body / range) * 20),
        };
        if (prevBreakDir === "down") choch_events.push({ ...ev, event_type: "choch_bullish" });
        else bos_events.push(ev);
        prevBreakDir = "up";
        break;
      }
    }
  }
  for (const sw of lowPivots.slice(-8)) {
    for (let j = sw.i + 1; j < bars.length; j++) {
      if (bars[j].close < sw.price) {
        const body = Math.abs(bars[j].close - bars[j].open);
        const range = bars[j].high - bars[j].low || 1;
        if (body / range < 0.35) break;
        const ev = {
          event_type: "bos_bearish",
          broken_swing_price: roundPrice(sw.price),
          break_price: roundPrice(bars[j].close),
          break_time: bars[j].open_time,
          open_time: bars[sw.i].open_time,
          confidence: r2(68 + (body / range) * 20),
        };
        if (prevBreakDir === "up") choch_events.push({ ...ev, event_type: "choch_bearish" });
        else bos_events.push(ev);
        prevBreakDir = "down";
        break;
      }
    }
  }
  bos_events.sort((a, b) => new Date(b.break_time) - new Date(a.break_time));
  choch_events.sort((a, b) => new Date(b.break_time) - new Date(a.break_time));

  // levels — nearest 2 only
  const asOf = bars[bars.length - 1].open_time;
  const mkLevel = (price, i) => ({
    price: roundPrice(price),
    strength: r2(0.55 + (1 - i / Math.max(1, bars.length)) * 0.35),
    touches: 1,
    created_at: bars[Math.max(0, i)].open_time,
    last_validated_at: asOf,
  });
  const resistance_levels = highPivots.slice(-2).reverse().map((s) => mkLevel(s.price, s.i));
  const support_levels = lowPivots.slice(-2).reverse().map((s) => mkLevel(s.price, s.i));

  return {
    swings,
    trend: {
      symbol_id: symbol.id,
      timeframe: tf,
      as_of: asOf,
      trend,
      market_phase,
      phase_confidence,
      confidence: r2(confidence),
    },
    levels: {
      symbol_id: symbol.id,
      timeframe: tf,
      as_of: asOf,
      support_levels,
      resistance_levels,
    },
    events: {
      symbol_id: symbol.id,
      timeframe: tf,
      // Current structure only — most recent BOS and CHoCH
      bos_events: bos_events.filter((e) => e.confidence >= 70).slice(0, 1),
      choch_events: choch_events.filter((e) => e.confidence >= 70).slice(0, 1),
      total: Math.min(1, bos_events.length) + Math.min(1, choch_events.length),
      _all_bos: bos_events,
      _all_choch: choch_events,
    },
  };
}

// ---- smart money concepts (high-confidence only) -------------------------
const MIN_SMC_CONFIDENCE = 72;

function orderBlocks(symbol, tf, bars) {
  const last = bars[bars.length - 1];
  const bodyAvg = bars.reduce((a, b) => a + Math.abs(b.close - b.open), 0) / bars.length;
  const out = [];
  // Scan recent impulsive candles only
  for (let i = bars.length - 4; i > Math.max(8, bars.length - 80) && out.length < 4; i--) {
    const b = bars[i];
    const body = Math.abs(b.close - b.open);
    if (body < bodyAvg * 1.85) continue;
    const bullish = b.close > b.open;
    const origin = bars[i - 1];
    const zoneHigh = origin.high;
    const zoneLow = origin.low;
    // Mitigation: price closed through the opposite side after creation
    let mitigated = false;
    let touches = 0;
    for (let j = i + 1; j < bars.length; j++) {
      const x = bars[j];
      if (x.low <= zoneHigh && x.high >= zoneLow) touches++;
      if (bullish && x.close < zoneLow) {
        mitigated = true;
        break;
      }
      if (!bullish && x.close > zoneHigh) {
        mitigated = true;
        break;
      }
    }
    if (mitigated) continue;
    const zonePct = ((zoneHigh - zoneLow) / last.close) * 100;
    if (zonePct > 2.5 || zonePct < 0.05) continue; // reject absurd / noise zones
    const freshness = 1 - (bars.length - 1 - i) / 80;
    const impulse = Math.min(1, body / (bodyAvg * 3));
    const confidence = r2(clamp(58 + impulse * 22 + freshness * 12 + (touches === 0 ? 6 : 2), 0, 96));
    if (confidence < MIN_SMC_CONFIDENCE) continue;
    out.push({
      order_block_id: `ob_${symbol.symbol_code}_${tf}_${i}`,
      type: bullish ? "bullish" : "bearish",
      zone_high: roundPrice(zoneHigh),
      zone_low: roundPrice(zoneLow),
      status: "active",
      mitigation_state: "unmitigated",
      touch_count: touches,
      strength_score: confidence,
      strength_components: { impulse: r2(impulse), freshness: r2(freshness), touches },
      confidence,
      explanation: `${bullish ? "Bullish" : "Bearish"} order block — impulsive ${bullish ? "demand" : "supply"} origin still unmitigated.`,
      created_at: origin.open_time,
      timeframe_code: tf,
    });
  }
  // Keep the single strongest active OB (chart clarity)
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 1);
}

function fairValueGaps(symbol, tf, bars) {
  const last = bars[bars.length - 1];
  const out = [];
  for (let i = bars.length - 4; i > Math.max(3, bars.length - 60) && out.length < 4; i--) {
    const a = bars[i - 1];
    const c = bars[i + 1];
    if (!a || !c) continue;
    let type = null;
    let gapLow = 0;
    let gapHigh = 0;
    if (c.low > a.high) {
      type = "bullish";
      gapLow = a.high;
      gapHigh = c.low;
    } else if (c.high < a.low) {
      type = "bearish";
      gapLow = c.high;
      gapHigh = a.low;
    } else continue;

    const size = gapHigh - gapLow;
    const mid = (gapLow + gapHigh) / 2;
    const gapPct = (size / mid) * 100;
    if (gapPct < 0.08 || gapPct > 3) continue;

    // Fill state vs subsequent price
    let fillPct = 0;
    for (let j = i + 2; j < bars.length; j++) {
      const x = bars[j];
      if (type === "bullish") {
        if (x.low <= gapLow) {
          fillPct = 100;
          break;
        }
        if (x.low < gapHigh) fillPct = Math.max(fillPct, ((gapHigh - x.low) / size) * 100);
      } else {
        if (x.high >= gapHigh) {
          fillPct = 100;
          break;
        }
        if (x.high > gapLow) fillPct = Math.max(fillPct, ((x.high - gapLow) / size) * 100);
      }
    }
    if (fillPct >= 50) continue; // only fresh / mostly unfilled

    const freshness = 1 - (bars.length - 1 - i) / 60;
    const confidence = r2(clamp(60 + Math.min(gapPct, 1.2) * 18 + freshness * 14, 0, 95));
    if (confidence < MIN_SMC_CONFIDENCE) continue;

    out.push({
      fvg_id: `fvg_${symbol.symbol_code}_${tf}_${i}`,
      type,
      gap_high: roundPrice(gapHigh),
      gap_low: roundPrice(gapLow),
      gap_size: roundPrice(size),
      gap_percent: r2(gapPct),
      status: "open",
      fill_state: fillPct > 5 ? "partially_filled" : "unfilled",
      fill_percentage: r2(fillPct),
      quality_score: confidence,
      quality_components: { size: r2(gapPct), freshness: r2(freshness) },
      confidence,
      explanation: `Fresh ${type} fair value gap — inefficiency still open near ${roundPrice(last.close)}.`,
      created_at: a.open_time,
    });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 1);
}

function liquiditySweeps(symbol, tf, bars, ms) {
  const out = [];
  const highs = ms.swings.filter((s) => s.kind === "high").slice(-4);
  const lows = ms.swings.filter((s) => s.kind === "low").slice(-4);
  const check = (pivotsArr, isHigh) => {
    for (const sw of pivotsArr) {
      for (let j = sw.i + 1; j < bars.length; j++) {
        const b = bars[j];
        const range = b.high - b.low || 1;
        if (isHigh && b.high > sw.price && b.close < sw.price) {
          const depth = b.high - sw.price;
          const rejection = (b.high - b.close) / range;
          if (rejection < 0.45) continue;
          const confidence = r2(clamp(60 + rejection * 25 + Math.min(depth / sw.price, 0.01) * 800, 0, 94));
          if (confidence < MIN_SMC_CONFIDENCE) continue;
          out.push(mkSweep(symbol, tf, "bearish", sw.price, depth, b.open_time, confidence, true));
          break;
        }
        if (!isHigh && b.low < sw.price && b.close > sw.price) {
          const depth = sw.price - b.low;
          const rejection = (b.close - b.low) / range;
          if (rejection < 0.45) continue;
          const confidence = r2(clamp(60 + rejection * 25 + Math.min(depth / sw.price, 0.01) * 800, 0, 94));
          if (confidence < MIN_SMC_CONFIDENCE) continue;
          out.push(mkSweep(symbol, tf, "bullish", sw.price, depth, b.open_time, confidence, true));
          break;
        }
      }
    }
  };
  check(highs, true);
  check(lows, false);
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 1);
}

function mkSweep(symbol, tf, type, level, depth, at, confidence, confirmed) {
  return {
    sweep_id: `sw_${symbol.symbol_code}_${tf}_${Math.round(level * 100)}`,
    type,
    sweep_level: roundPrice(level),
    level_type: type === "bearish" ? "swing_high" : "swing_low",
    penetration_depth: roundPrice(depth),
    status: confirmed ? "confirmed" : "active",
    strength_score: confidence,
    strength_components: { rejection: confidence },
    confirmation_components: { close_back: confirmed ? 1 : 0 },
    confidence,
    explanation: `Confirmed ${type} liquidity sweep beyond ${roundPrice(level)}.`,
    created_at: at,
    confirmed_at: confirmed ? at : null,
    failed_at: null,
    invalidated_at: null,
  };
}

// ---- trade setups --------------------------------------------------------
const SETUP_TYPES = ["order_block_reversal", "fvg_continuation", "liquidity_sweep_reversal", "trend_continuation", "range_breakout"];

function confidenceLevel(score) {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function tradeSetups(symbol, tf, bars, ms, ob, fvg, sweeps) {
  const last = bars[bars.length - 1];
  const price = last.close;
  const active = [];
  const anchor = ob[0] || fvg[0] || null;
  const trendOk = ms.trend.trend === "bullish" || ms.trend.trend === "bearish";
  if (anchor && trendOk) {
    const fromOb = Boolean(ob[0]);
    const bullish = fromOb ? ob[0].type === "bullish" : fvg[0].type === "bullish";
    if ((bullish && ms.trend.trend === "bullish") || (!bullish && ms.trend.trend === "bearish")) {
      const zoneLow = fromOb ? ob[0].zone_low : fvg[0].gap_low;
      const zoneHigh = fromOb ? ob[0].zone_high : fvg[0].gap_high;
      const entryMid = (zoneLow + zoneHigh) / 2;
      const risk = Math.max(Math.abs(zoneHigh - zoneLow), price * 0.006);
      const stop = bullish ? zoneLow - risk * 0.15 : zoneHigh + risk * 0.15;
      const rr = 2.0;
      const conf = r2(
        clamp((anchor.confidence ?? 70) * 0.55 + ms.trend.confidence * 0.35 + (sweeps[0]?.confirmed_at ? 8 : 0), 50, 96),
      );
      if (conf >= 72 && ms.trend.confidence >= 65) {
        const t1 = bullish ? entryMid + risk : entryMid - risk;
        const t2 = bullish ? entryMid + risk * rr : entryMid - risk * rr;
        const setupType = fromOb ? "order_block_reversal" : "fvg_continuation";
        active.push({
          setup_id: `setup_${symbol.symbol_code}_${tf}_primary`,
          setup_type: setupType,
          direction: bullish ? "bullish" : "bearish",
          confidence_score: conf,
          confidence_level: confidenceLevel(conf),
          evidence_scores: {
            market_structure: r2(ms.trend.confidence),
            order_block: r2(ob[0]?.confidence ?? 0),
            fair_value_gap: r2(fvg[0]?.confidence ?? 0),
            liquidity: r2(sweeps[0]?.confidence ?? 0),
            momentum: r2(ms.trend.confidence),
            volume: r2(Math.min(90, 55 + (last.volume > 0 ? 15 : 0))),
          },
          entry_zone: {
            low: roundPrice(Math.min(zoneLow, zoneHigh)),
            high: roundPrice(Math.max(zoneLow, zoneHigh)),
            label: bullish ? "Buy Zone" : "Sell Zone",
          },
          stop_loss_zone: { low: roundPrice(stop), high: roundPrice(stop), label: "Stop" },
          target_zones: [
            { low: roundPrice(t1), high: roundPrice(t1), label: "TP1" },
            { low: roundPrice(t2), high: roundPrice(t2), label: "TP2" },
          ],
          risk_reward: r2(rr),
          status: "active",
          signal_state: "entry_ready",
          explanation: `High-confidence ${bullish ? "BUY" : "SELL"} plan on ${symbol.symbol_code} ${tf} from ${setupType.replace(/_/g, " ")} aligned with ${ms.trend.trend} structure.`,
          reference_ids: {
            order_block_id: ob[0]?.order_block_id ?? null,
            fvg_id: fvg[0]?.fvg_id ?? null,
            sweep_id: sweeps[0]?.sweep_id ?? null,
          },
          detected_at: last.open_time,
          engine_version: "accuracy-1.0.0",
        });
      }
    }
  }
  return { active, historical: [] };
}

// ---- strategies ----------------------------------------------------------
export const STRATEGIES = [
  { strategy_id: "ob_reversal", strategy_name: "Order Block Reversal", strategy_version: "1.2.0", description: "Fades price into unmitigated order blocks aligned with the higher-timeframe bias.", required_setup_types: ["order_block_reversal"] },
  { strategy_id: "fvg_continuation", strategy_name: "FVG Continuation", strategy_version: "1.1.0", description: "Enters continuation trades as price rebalances a fair value gap in the trend direction.", required_setup_types: ["fvg_continuation", "trend_continuation"] },
  { strategy_id: "liquidity_reversal", strategy_name: "Liquidity Sweep Reversal", strategy_version: "1.3.0", description: "Trades reversals after liquidity is swept beyond a key swing point.", required_setup_types: ["liquidity_sweep_reversal"] },
  { strategy_id: "trend_rider", strategy_name: "Trend Rider", strategy_version: "2.0.0", description: "Rides established trends, adding on pullbacks that respect structure.", required_setup_types: ["trend_continuation"] },
  { strategy_id: "range_breakout", strategy_name: "Range Breakout", strategy_version: "1.0.0", description: "Captures expansion as price breaks out of an accumulation range.", required_setup_types: ["range_breakout"] },
];

function strategyMeta(s) {
  return {
    ...s,
    supported_markets: ["crypto", "equity"],
    supported_timeframes: ["15m", "1h", "4h", "1d"],
    default_parameters: { min_confidence: 68, risk_per_trade_pct: 1 },
  };
}

function buildPlans(symbol, tf, strategyId, active) {
  const rng = mulberry32(xfnv1a(`${symbol.id}:${tf}:${strategyId}:plans`));
  const strat = STRATEGIES.find((s) => s.strategy_id === strategyId);
  if (!strat) return [];
  const matching = active.filter((s) => strat.required_setup_types.includes(s.setup_type));
  return matching.map((s, i) => {
    const bullish = s.direction === "bullish";
    const entry = (s.entry_zone.low + s.entry_zone.high) / 2;
    return {
      plan_id: `plan_${symbol.symbol_code}_${tf}_${strategyId}_${i}`,
      strategy_id: strategyId,
      setup_id: s.setup_id,
      direction: s.direction,
      entry_zone: { low: s.entry_zone.low, high: s.entry_zone.high },
      stop_loss: s.stop_loss_zone.low,
      target_1: s.target_zones[0]?.low ?? entry,
      target_2: s.target_zones[1]?.low ?? entry,
      target_3: s.target_zones[2]?.low ?? null,
      risk_reward: s.risk_reward,
      trade_expiration_bars: 12 + Math.floor(rng() * 24),
      position_risk_pct: r2(0.5 + rng() * 1.5),
      strategy_confidence: clamp(r2(s.confidence_score + (rng() - 0.5) * 10), 35, 96),
      reasoning: `${strat.strategy_name} accepts this ${s.setup_type.replace(/_/g, " ")}: entry ${bullish ? "above" : "below"} ${roundPrice(entry)} with a ${s.risk_reward}:1 reward-to-risk profile and structural invalidation at ${s.stop_loss_zone.low}.`,
      detected_at: s.detected_at,
    };
  });
}

// ---- analysis result series (for overlays / cards) -----------------------
function analysisSeries(bars, ms) {
  const closes = bars.map((b) => b.close);
  const emaV = ema(closes, 20);
  const smaV = sma(closes, 20);
  const rsiV = rsi(closes, 14);
  const macdV = macd(closes);
  const atrV = atr(bars, 14);
  const vwapV = vwap(bars);
  const swingByIndex = new Map(ms.swings.map((s) => [s.i, s]));

  const bar = (i, values) => ({
    open_time: bars[i].open_time,
    plugin_version: "1.0.0",
    params_hash: "demo",
    values,
    computed_at: bars[i].open_time,
  });

  const build = (pluginId, fn) => {
    const items = [];
    for (let i = 0; i < bars.length; i++) {
      const v = fn(i);
      if (v) items.push({ ...bar(i, v), plugin_id: pluginId });
    }
    return items;
  };

  return {
    ema: build("ema", (i) => (emaV[i] != null ? { ema: roundPrice(emaV[i]) } : null)),
    sma: build("sma", (i) => (smaV[i] != null ? { sma: roundPrice(smaV[i]) } : null)),
    vwap: build("vwap", (i) => ({ vwap: roundPrice(vwapV[i]) })),
    rsi: build("rsi", (i) => (rsiV[i] != null ? { rsi: r2(rsiV[i]) } : null)),
    macd: build("macd", (i) => (macdV[i].macd != null ? { macd: r2(macdV[i].macd), signal: macdV[i].signal != null ? r2(macdV[i].signal) : null, histogram: macdV[i].histogram != null ? r2(macdV[i].histogram) : null } : null)),
    atr: build("atr", (i) => (atrV[i] != null ? { atr: roundPrice(atrV[i]) } : null)),
    market_structure: build("market_structure", (i) => {
      const sw = swingByIndex.get(i);
      return {
        trend: ms.trend.trend,
        swing_type: sw ? sw.label : null,
        is_swing_high: sw?.kind === "high",
        is_swing_low: sw?.kind === "low",
        market_phase: ms.trend.market_phase,
        confidence: ms.trend.confidence,
      };
    }),
  };
}

// ---- full assembly + cache (short TTL so live prices stay fresh) ----------
const cache = new Map();
const CACHE_TTL_MS = 20_000;
const inflight = new Map();

export async function analysisFor(symbolId, tf) {
  const key = `${symbolId}:${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const symbol = SYMBOLS.find((s) => s.id === symbolId);
    if (!symbol) return null;
    const loaded = await loadCandles(symbol, tf);
    const bars = loaded.bars;
    if (!bars.length) return null;
    const ms = marketStructure(symbol, tf, bars);
    const ob = orderBlocks(symbol, tf, bars);
    const fvg = fairValueGaps(symbol, tf, bars);
    const sweeps = liquiditySweeps(symbol, tf, bars, ms);
    const setups = tradeSetups(symbol, tf, bars, ms, ob, fvg, sweeps);
    const series = analysisSeries(bars, ms);
    const result = {
      symbol,
      tf,
      bars,
      ms,
      ob,
      fvg,
      sweeps,
      setups,
      series,
      source: loaded.source,
      providerLabel: loaded.providerLabel,
      referenceNote: loaded.referenceNote,
      yahooTicker: loaded.yahooTicker,
    };
    cache.set(key, { ts: Date.now(), data: result });
    return result;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

/** Drop cached analysis so the next request pulls fresh provider candles. */
export function invalidateAnalysis(symbolId, tf) {
  if (symbolId && tf) cache.delete(`${symbolId}:${tf}`);
  else cache.clear();
}

// ---- market quote (session OHLC, prev close, VWAP, status) ---------------
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const quoteCache = new Map();
const QUOTE_TTL_MS = 12_000;

function toIstParts(d = new Date()) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: ist.getUTCFullYear(),
    m: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    dow: ist.getUTCDay(),
    h: ist.getUTCHours(),
    min: ist.getUTCMinutes(),
  };
}

function isNseMarketOpen(now = new Date()) {
  const p = toIstParts(now);
  if (p.dow === 0 || p.dow === 6) return false;
  const mins = p.h * 60 + p.min;
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

function sessionKey(symbol, ms) {
  const d = new Date(ms);
  const isIndia = symbol.exchange === "nse" || symbol.market_type === "equity";
  const local = isIndia ? new Date(d.getTime() + IST_OFFSET_MS) : d;
  const y = isIndia ? local.getUTCFullYear() : local.getUTCFullYear();
  const m = isIndia ? local.getUTCMonth() : local.getUTCMonth();
  const day = isIndia ? local.getUTCDate() : local.getUTCDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function pctDiff(a, b) {
  if (!b) return Math.abs(a);
  return Math.abs((a - b) / b);
}

/** Live session quote from provider candles — used for header + reference lines. */
export async function marketQuoteFor(symbol) {
  const key = symbol.id;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.ts < QUOTE_TTL_MS) return hit.data;

  const [intradayLoaded, dailyLoaded] = await Promise.all([
    loadCandles(symbol, "15m", 220),
    loadCandles(symbol, "1d", 12),
  ]);
  const bars = intradayLoaded.bars;
  const dayBars = dailyLoaded.bars;
  const now = new Date();
  const todayKey = sessionKey(symbol, now.getTime());
  const todayBars = bars.filter((b) => sessionKey(symbol, new Date(b.open_time).getTime()) === todayKey);
  const lastBar = bars[bars.length - 1];
  const currentPrice = lastBar?.close ?? symbol.basePrice;

  let dayOpen = currentPrice;
  let dayHigh = currentPrice;
  let dayLow = currentPrice;
  let dayVolume = 0;

  if (todayBars.length) {
    dayOpen = todayBars[0].open;
    dayHigh = Math.max(...todayBars.map((b) => b.high));
    dayLow = Math.min(...todayBars.map((b) => b.low));
    dayVolume = todayBars.reduce((s, b) => s + b.volume, 0);
  } else if (dayBars.length) {
    const latestDaily = dayBars[dayBars.length - 1];
    dayOpen = latestDaily.open;
    dayHigh = latestDaily.high;
    dayLow = latestDaily.low;
    dayVolume = latestDaily.volume;
  }

  const prevDailyCandidates = dayBars.filter(
    (b) => sessionKey(symbol, new Date(b.open_time).getTime()) < todayKey,
  );
  const prevDay = prevDailyCandidates[prevDailyCandidates.length - 1] ?? dayBars[dayBars.length - 2];
  const prevClose = prevDay?.close ?? currentPrice;
  const prevDayHigh = prevDay?.high ?? prevClose;
  const prevDayLow = prevDay?.low ?? prevClose;

  const dayChange = currentPrice - prevClose;
  const dayChangePct = prevClose ? (dayChange / prevClose) * 100 : 0;

  const volHistory = dayBars.slice(0, -1).slice(-20);
  const avgVolume = volHistory.length
    ? volHistory.reduce((s, b) => s + b.volume, 0) / volHistory.length
    : dayVolume;

  let cumPV = 0;
  let cumV = 0;
  const vwapBars = todayBars.length ? todayBars : lastBar ? [lastBar] : [];
  for (const b of vwapBars) {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
  }
  const vwapVal = cumV > 0 ? cumPV / cumV : currentPrice;

  const isEquity = symbol.exchange === "nse" || symbol.market_type === "equity";
  const marketStatus = isEquity ? (isNseMarketOpen(now) ? "OPEN" : "CLOSED") : "OPEN";

  const data = {
    symbol_id: symbol.id,
    symbol_code: symbol.symbol_code,
    current_price: roundPrice(currentPrice),
    day_open: roundPrice(dayOpen),
    day_high: roundPrice(dayHigh),
    day_low: roundPrice(dayLow),
    prev_close: roundPrice(prevClose),
    prev_day_high: roundPrice(prevDayHigh),
    prev_day_low: roundPrice(prevDayLow),
    day_change: roundPrice(dayChange),
    day_change_pct: r2(dayChangePct),
    day_range: roundPrice(dayHigh - dayLow),
    volume: r2(dayVolume),
    avg_volume: r2(avgVolume),
    vwap: roundPrice(vwapVal),
    market_status: marketStatus,
    last_updated: lastBar?.close_time ?? now.toISOString(),
    provider: intradayLoaded.providerLabel ?? dailyLoaded.providerLabel,
    source: intradayLoaded.source ?? dailyLoaded.source,
    reference_note: intradayLoaded.referenceNote ?? dailyLoaded.referenceNote,
    yahoo_ticker: intradayLoaded.yahooTicker ?? dailyLoaded.yahooTicker ?? null,
  };
  quoteCache.set(key, { ts: Date.now(), data });
  return data;
}

/** Compare served quote vs a fresh provider pull (developer diagnostics). */
export async function verifyMarketQuote(symbol) {
  quoteCache.delete(symbol.id);
  invalidateAnalysis(symbol.id, "15m");
  invalidateAnalysis(symbol.id, "1d");
  const quote = await marketQuoteFor(symbol);
  const { fetchMarketCandles } = await import("./market-data.mjs");
  const fresh = await fetchMarketCandles(symbol, "15m", 120);
  const freshBars = fresh.bars;
  const now = Date.now();
  const todayKey = sessionKey(symbol, now);
  const todayFresh = freshBars.filter((b) => sessionKey(symbol, new Date(b.open_time).getTime()) === todayKey);
  const refLast = freshBars[freshBars.length - 1];
  const refHigh = todayFresh.length ? Math.max(...todayFresh.map((b) => b.high)) : refLast?.high;
  const refLow = todayFresh.length ? Math.min(...todayFresh.map((b) => b.low)) : refLast?.low;
  const refVol = todayFresh.length ? todayFresh.reduce((s, b) => s + b.volume, 0) : refLast?.volume ?? 0;

  const checks = [];
  const priceTol = 0.0001;
  const volTol = 0.02;

  if (refLast) {
    const fields = [
      { field: "current_price", ours: quote.current_price, ref: refLast.close },
      { field: "day_high", ours: quote.day_high, ref: refHigh },
      { field: "day_low", ours: quote.day_low, ref: refLow },
    ];
    for (const f of fields) {
      const pct = pctDiff(f.ours, f.ref);
      if (pct > priceTol) {
        checks.push({
          field: f.field,
          ours: f.ours,
          reference: f.ref,
          pct_diff: Number((pct * 100).toFixed(4)),
          tolerance_pct: priceTol * 100,
        });
      }
    }
    const volPct = refVol > 0 ? pctDiff(quote.volume, refVol) : 0;
    if (refVol > 0 && volPct > volTol) {
      checks.push({
        field: "volume",
        ours: quote.volume,
        reference: refVol,
        pct_diff: Number((volPct * 100).toFixed(4)),
        tolerance_pct: volTol * 100,
      });
    }
    if (refLast.open_time) {
      const tDiff = Math.abs(new Date(quote.last_updated).getTime() - new Date(refLast.close_time ?? refLast.open_time).getTime()) / 1000;
      if (tDiff > 120) {
        checks.push({
          field: "last_updated",
          ours: quote.last_updated,
          reference: refLast.close_time ?? refLast.open_time,
          pct_diff: tDiff,
          tolerance_pct: 120,
          unit: "seconds",
        });
      }
    }
  }

  return {
    quote,
    verification: {
      ok: checks.length === 0,
      mismatches: checks.length,
      checks,
      reference_provider: fresh.providerLabel,
      compared_at: new Date().toISOString(),
    },
  };
}

export function strategiesList() {
  return { items: STRATEGIES.map(strategyMeta), total: STRATEGIES.length };
}

export async function strategyDetail(strategyId, symbolId, tf) {
  const meta = STRATEGIES.find((s) => s.strategy_id === strategyId);
  if (!meta) return null;
  const a = await analysisFor(symbolId, tf);
  const plans = a ? buildPlans(a.symbol, tf, strategyId, a.setups.active) : [];
  return { strategy: strategyMeta(meta), recent_plans: plans };
}

// ---- backtests -----------------------------------------------------------
const backtests = new Map();
export async function startBacktest(body) {
  const runId = `bt_${Math.random().toString(36).slice(2, 10)}`;
  const a = await analysisFor(body.symbol_id, body.timeframe);
  const rng = mulberry32(xfnv1a(runId));
  const initial = 10000;
  let equity = initial;
  const trades = [];
  const curve = [{ index: 0, time: a?.bars[0]?.open_time ?? iso(Date.now()), equity: r2(equity) }];
  const source = a?.setups.historical ?? [];
  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  const n = Math.min(source.length, 24);
  for (let i = 0; i < n; i++) {
    const s = source[i];
    const bullish = s.direction === "bullish";
    const win = rng() < 0.52;
    const riskAmt = equity * 0.01;
    const pnl = win ? riskAmt * s.risk_reward : -riskAmt;
    equity += pnl;
    if (win) {
      wins++;
      grossWin += pnl;
    } else {
      grossLoss += -pnl;
    }
    const entryPrice = (s.entry_zone.low + s.entry_zone.high) / 2;
    trades.push({
      trade_id: `t_${i}`,
      plan_id: `plan_${i}`,
      setup_id: s.setup_id,
      direction: s.direction,
      entry_time: s.detected_at,
      exit_time: s.detected_at,
      entry_price: roundPrice(entryPrice),
      exit_price: roundPrice(win ? (bullish ? entryPrice * (1 + 0.02 * s.risk_reward) : entryPrice * (1 - 0.02 * s.risk_reward)) : bullish ? entryPrice * 0.98 : entryPrice * 1.02),
      quantity: r2(riskAmt / entryPrice),
      pnl: r2(pnl),
      pnl_pct: r2((pnl / equity) * 100),
      commission: r2(riskAmt * 0.0008),
      exit_reason: win ? "target_hit" : "stopped_out",
      bars_held: 3 + Math.floor(rng() * 20),
    });
    curve.push({ index: i + 1, time: s.detected_at, equity: r2(equity) });
  }
  const netPnl = equity - initial;
  const peak = curve.reduce((m, c) => Math.max(m, c.equity), initial);
  const trough = curve.reduce((m, c) => Math.min(m, c.equity), initial);
  const metrics = {
    total_trades: trades.length,
    win_rate: r2(trades.length ? (wins / trades.length) * 100 : 0),
    profit_factor: r2(grossLoss ? grossWin / grossLoss : grossWin > 0 ? 99 : 0),
    net_pnl: r2(netPnl),
    net_pnl_pct: r2((netPnl / initial) * 100),
    max_drawdown_pct: r2(((peak - trough) / peak) * 100),
    sharpe_ratio: r2(0.6 + rng() * 1.8),
    avg_win: r2(wins ? grossWin / wins : 0),
    avg_loss: r2(trades.length - wins ? grossLoss / (trades.length - wins) : 0),
    expectancy: r2(trades.length ? netPnl / trades.length : 0),
    initial_capital: initial,
    final_capital: r2(equity),
  };
  const record = {
    run_id: runId,
    strategy_id: body.strategy_id ?? "trend_rider",
    status: "completed",
    started_at: iso(Date.now()),
    completed_at: iso(Date.now()),
    bars_processed: a?.bars.length ?? 0,
    initial_capital: initial,
    final_capital: r2(equity),
    metrics,
    equity_curve: curve,
    trades,
  };
  backtests.set(runId, record);
  return record;
}
export function getBacktest(runId) {
  return backtests.get(runId) ?? null;
}
