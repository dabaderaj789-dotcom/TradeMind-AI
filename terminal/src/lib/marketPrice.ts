/**
 * Single synchronized price source for header, pane toolbar and chart.
 * Resolves the freshest of: live quote vs latest candle of the visible timeframe,
 * and reports data age so delayed feeds are labelled instead of passed off as live.
 */

import type { Candle, MarketQuote } from "./types";
import type { Tone } from "./format";
import { num } from "./format";
import { isIndiaSessionOpen } from "./briefing";

export interface ResolvedPrice {
  /** The one price every surface should display. */
  price: number | null;
  /** Timestamp (ms) the price was produced at. */
  asOfMs: number | null;
  /** Where the freshest price came from. */
  source: "quote" | "candle" | null;
}

const TF_SECONDS: Record<string, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

/** Quote sources that can honestly claim LIVE when the stamp is fresh. */
const LIVE_TICK_SOURCES = new Set([
  "binance_ticker",
  "binance_ws_trade",
  "gold_spot",
]);

/** Provider-aware max age (seconds) for a LIVE badge. */
const LIVE_MAX_AGE_SEC: Record<string, number> = {
  binance_ticker: 15,
  binance_ws_trade: 15,
  gold_spot: 45,
};

export function timeframeSeconds(tf: string): number {
  return TF_SECONDS[tf] ?? 900;
}

/**
 * Pick the freshest known price between the quote and the last visible candle.
 * Guarantees header and chart agree because both consume this one value.
 * Never prefers a candle close over a newer provider quote.
 */
export function resolvePrice(quote: MarketQuote | null | undefined, bars: Candle[]): ResolvedPrice {
  const last = bars.length ? bars[bars.length - 1] : null;
  const rawCandleTs = last ? Date.parse(last.close_time || last.open_time) : NaN;
  const quoteTs = quote ? Date.parse(quote.last_updated) : NaN;
  // Open-bar close_time is often in the future — cap so a live quote is not
  // treated as "staler" than the forming tip's scheduled close.
  const now = Date.now();
  const candleTs =
    Number.isFinite(rawCandleTs) && rawCandleTs > now + 2_000 ? now : rawCandleTs;

  const candleOk = !!last && Number.isFinite(candleTs);
  const quoteOk =
    !!quote &&
    Number.isFinite(quoteTs) &&
    Number.isFinite(quote.current_price) &&
    quote.current_price > 0;

  // Prefer a fresh quote (live ticker / last price) over a static candle close.
  if (quoteOk && (!candleOk || quoteTs >= candleTs - 500)) {
    return { price: quote.current_price, asOfMs: quoteTs, source: "quote" };
  }
  if (candleOk) {
    return { price: num(last.close), asOfMs: candleTs, source: "candle" };
  }
  if (quoteOk) return { price: quote.current_price, asOfMs: quoteTs, source: "quote" };
  return { price: null, asOfMs: null, source: null };
}

export interface Freshness {
  label: string;
  tone: Tone;
  live: boolean;
  ageSeconds: number | null;
  /** Distinct from socket status — market-data quality only. */
  status: "LIVE" | "DELAYED" | "STALE" | "CLOSED" | "UNAVAILABLE";
}

export interface FreshnessOpts {
  quoteSource?: string | null;
  /** Last stored / visible candle open time (ms). Used to detect history lag. */
  candleOpenMs?: number | null;
  nowMs?: number;
}

function ageLabel(sec: number): string {
  if (sec < 90) return `${Math.max(1, Math.round(sec))}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function candleLagBars(candleOpenMs: number | null | undefined, timeframe: string, nowMs: number): number {
  if (candleOpenMs == null || !Number.isFinite(candleOpenMs)) return 0;
  const tfMs = (TF_SECONDS[timeframe] ?? 900) * 1000;
  const currentOpen = Math.floor(nowMs / tfMs) * tfMs;
  if (candleOpenMs >= currentOpen - tfMs) return 0;
  return Math.max(0, Math.floor((currentOpen - candleOpenMs) / tfMs));
}

/**
 * Classify market-data freshness. Connection health is separate (status bar chip).
 *
 * LIVE      — market open, quote from a true live ticker source, stamp within
 *             provider window, and candle history not more than ~2 bars behind.
 * DELAYED   — market open; Yahoo / delayed last-price feeds (honest about lag).
 * STALE     — market open but quote/candles too old, or candle history lagged.
 * CLOSED    — cash session closed; last price is the session close.
 * UNAVAILABLE — no usable timestamp.
 */
export function dataFreshness(
  asOfMs: number | null,
  timeframe: string,
  marketStatus?: "OPEN" | "CLOSED" | null,
  exchangeHint?: string | null,
  opts: FreshnessOpts = {},
): Freshness {
  if (asOfMs == null) {
    return { label: "NO DATA", tone: "neutral", live: false, ageSeconds: null, status: "UNAVAILABLE" };
  }

  const now = opts.nowMs ?? Date.now();
  const exch = (exchangeHint ?? "").toLowerCase();
  const isIndia = exch === "nse" || exch === "bse" || exch === "india" || exch.includes("nse");
  let session = marketStatus ?? null;
  if (session == null && isIndia) {
    session = isIndiaSessionOpen(new Date(now)) ? "OPEN" : "CLOSED";
  }

  const age = Math.max(0, (now - asOfMs) / 1000);
  const source = (opts.quoteSource ?? "").toLowerCase();
  const lagBars = candleLagBars(opts.candleOpenMs, timeframe, now);

  if (session === "CLOSED") {
    return { label: "CLOSED", tone: "neutral", live: false, ageSeconds: age, status: "CLOSED" };
  }

  // History gap: never claim LIVE while the chart is days/hours behind the tip.
  if (lagBars > 2) {
    return {
      label: `STALE CANDLES ${ageLabel(lagBars * (TF_SECONDS[timeframe] ?? 900))}`,
      tone: "warn",
      live: false,
      ageSeconds: age,
      status: "STALE",
    };
  }

  // Persisted / session-closed sources while the venue claims OPEN.
  if (
    source === "persisted_candles" ||
    source === "yahoo_delayed" ||
    source.includes("persisted")
  ) {
    return {
      label: `STALE ${ageLabel(age)}`,
      tone: "warn",
      live: false,
      ageSeconds: age,
      status: "STALE",
    };
  }

  // Yahoo NSE last-price is delayed vs broker ticks — never green LIVE.
  if (source === "yahoo_last" || source.startsWith("yahoo")) {
    return {
      label: `DELAYED ${ageLabel(age)}`,
      tone: "warn",
      live: false,
      ageSeconds: age,
      status: "DELAYED",
    };
  }

  if (LIVE_TICK_SOURCES.has(source)) {
    const maxAge = LIVE_MAX_AGE_SEC[source] ?? 30;
    if (age <= maxAge) {
      return { label: "LIVE", tone: "bull", live: true, ageSeconds: age, status: "LIVE" };
    }
    return {
      label: `STALE ${ageLabel(age)}`,
      tone: "warn",
      live: false,
      ageSeconds: age,
      status: "STALE",
    };
  }

  // Unknown source: keep a conservative delayed window (not LIVE).
  const tfSec = TF_SECONDS[timeframe] ?? 900;
  const delayedWindow = Math.max(120, Math.min(tfSec * 1.5, 5400));
  if (age <= delayedWindow) {
    return {
      label: `DELAYED ${ageLabel(age)}`,
      tone: "warn",
      live: false,
      ageSeconds: age,
      status: "DELAYED",
    };
  }
  return {
    label: `STALE ${ageLabel(age)}`,
    tone: "warn",
    live: false,
    ageSeconds: age,
    status: "STALE",
  };
}

/** Format a UTC/ISO stamp as IST clock for the status bar. */
export function formatIstTime(isoOrMs: string | number | null | undefined): string {
  if (isoOrMs == null) return "—";
  const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}
