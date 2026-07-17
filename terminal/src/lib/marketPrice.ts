/**
 * Single synchronized price source for header, pane toolbar and chart.
 * Resolves the freshest of: live quote vs latest candle of the visible timeframe,
 * and reports data age so delayed feeds are labelled instead of passed off as live.
 */

import type { Candle, MarketQuote } from "./types";
import type { Tone } from "./format";
import { num } from "./format";

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

export function timeframeSeconds(tf: string): number {
  return TF_SECONDS[tf] ?? 900;
}

/**
 * Pick the freshest known price between the quote and the last visible candle.
 * Guarantees header and chart agree because both consume this one value.
 */
export function resolvePrice(quote: MarketQuote | null | undefined, bars: Candle[]): ResolvedPrice {
  const last = bars.length ? bars[bars.length - 1] : null;
  const candleTs = last ? Date.parse(last.close_time || last.open_time) : NaN;
  const quoteTs = quote ? Date.parse(quote.last_updated) : NaN;

  const candleOk = last && Number.isFinite(candleTs);
  const quoteOk = quote && Number.isFinite(quoteTs) && Number.isFinite(quote.current_price) && quote.current_price > 0;

  if (quoteOk && (!candleOk || quoteTs >= candleTs)) {
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
}

function ageLabel(sec: number): string {
  if (sec < 90) return `${Math.max(1, Math.round(sec))}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

/**
 * Classify data age for the active timeframe.
 * LIVE      — within ~1.5 bars of the timeframe (or 2 min for intraday).
 * DELAYED   — market open but data older than that; shows explicit lag.
 * CLOSED    — market session closed; last price is the session close.
 *
 * Prefer the visible chart tip for age when it is newer than the quote —
 * otherwise a stale quote can falsely mark a fresh chart as DELAYED.
 */
export function dataFreshness(
  asOfMs: number | null,
  timeframe: string,
  marketStatus?: "OPEN" | "CLOSED" | null,
): Freshness {
  if (asOfMs == null) return { label: "NO DATA", tone: "neutral", live: false, ageSeconds: null };
  const age = Math.max(0, (Date.now() - asOfMs) / 1000);
  if (marketStatus === "CLOSED") {
    return { label: "CLOSED", tone: "neutral", live: false, ageSeconds: age };
  }
  const tfSec = TF_SECONDS[timeframe] ?? 900;
  const liveWindow = Math.max(120, Math.min(tfSec * 1.5, 5400));
  if (age <= liveWindow) return { label: "LIVE", tone: "bull", live: true, ageSeconds: age };
  return { label: `DELAYED ${ageLabel(age)}`, tone: "warn", live: false, ageSeconds: age };
}
