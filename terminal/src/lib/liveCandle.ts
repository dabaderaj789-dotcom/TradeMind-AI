/**
 * Live forming candle — TradingView-style.
 *
 * Crypto (Binance): UTC-aligned bar opens.
 * India (NSE/BSE): session-aligned from 09:15 IST (matches stored 1h/1d tips).
 * Axis labels still convert UTC instants → IST for display.
 *
 * Yahoo sometimes stamps the forming tip with "now" instead of the bar open.
 * We coalesce anything inside the current bar window onto the real open.
 */

import type { Candle } from "./types";
import { timeframeSeconds } from "./marketPrice";
import { num } from "./format";
import { isIndiaSessionOpen } from "./briefing";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type CandleAlign = "utc" | "nse";

export interface LiveCandleOpts {
  /** When false (NSE closed), do not invent new after-hours bars. */
  allowNewBar?: boolean;
  /** Bar open alignment — utc for crypto, nse for India. */
  align?: CandleAlign;
}

function istParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
  };
}

function istWallToUtcMs(y: number, m: number, day: number, h: number, min: number): number {
  return Date.UTC(y, m, day, h, min, 0) - IST_OFFSET_MS;
}

/** NSE cash session close (15:30 IST) as UTC ms for the IST calendar day of `nowMs`. */
function nseSessionBounds(nowMs: number): { openMs: number; closeMs: number } | null {
  const p = istParts(nowMs);
  if (p.dow === 0 || p.dow === 6) return null;
  return {
    openMs: istWallToUtcMs(p.y, p.m, p.day, 9, 15),
    closeMs: istWallToUtcMs(p.y, p.m, p.day, 15, 30),
  };
}

/**
 * Floor wall-clock to the current bar open (ms).
 * Returns null for NSE outside the cash session (no forming intraday bar).
 */
export function currentBarOpenMs(
  timeframe: string,
  nowMs = Date.now(),
  align: CandleAlign = "utc",
): number | null {
  if (align === "nse") return currentNseBarOpenMs(timeframe, nowMs);
  const tfMs = timeframeSeconds(timeframe) * 1000;
  return Math.floor(nowMs / tfMs) * tfMs;
}

/** NSE: bars from 09:15 IST in tf steps (1h → 09:15, 10:15…; 1d → 09:15). */
function currentNseBarOpenMs(timeframe: string, nowMs: number): number | null {
  const bounds = nseSessionBounds(nowMs);
  if (!bounds) return null;

  const tfSec = timeframeSeconds(timeframe);
  const { openMs: sessionOpen, closeMs: sessionClose } = bounds;

  // Daily / weekly: one session bar opening at 09:15 IST
  if (tfSec >= 86400) {
    if (nowMs < sessionOpen) return null;
    return sessionOpen;
  }

  if (nowMs < sessionOpen || nowMs >= sessionClose) return null;

  const tfMs = tfSec * 1000;
  const openMs = sessionOpen + Math.floor((nowMs - sessionOpen) / tfMs) * tfMs;
  if (openMs >= sessionClose) return null;
  return openMs;
}

/** Exclusive bar close ms (open + tf), capped at NSE session close when aligned. */
export function currentBarCloseMs(
  timeframe: string,
  nowMs = Date.now(),
  align: CandleAlign = "utc",
): number | null {
  const openMs = currentBarOpenMs(timeframe, nowMs, align);
  if (openMs == null) return null;
  const natural = openMs + timeframeSeconds(timeframe) * 1000;
  if (align === "nse") {
    const bounds = nseSessionBounds(nowMs);
    if (bounds) return Math.min(natural, bounds.closeMs);
  }
  return natural;
}

/** Seconds remaining until the current bar closes. Null outside NSE session. */
export function candleCountdownSec(
  timeframe: string,
  nowMs = Date.now(),
  align: CandleAlign = "utc",
): number | null {
  const closeMs = currentBarCloseMs(timeframe, nowMs, align);
  if (closeMs == null) return null;
  return Math.max(0, Math.ceil((closeMs - nowMs) / 1000));
}

export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Whether India / crypto should append a new forming tip right now. */
export function shouldAllowLiveBar(opts: {
  market?: string | null;
  exchangeCode?: string | null;
  marketStatus?: "OPEN" | "CLOSED" | null;
  nowMs?: number;
}): boolean {
  const exch = (opts.exchangeCode ?? "").toLowerCase();
  const market = (opts.market ?? "").toLowerCase();
  const isCrypto = market === "crypto" || exch === "binance";
  if (isCrypto) return true;

  const isIndia =
    market === "india" || exch === "nse" || exch === "bse" || exch.includes("nse");
  if (isIndia) {
    if (opts.marketStatus === "CLOSED") return false;
    if (opts.marketStatus === "OPEN") return true;
    return isIndiaSessionOpen(new Date(opts.nowMs ?? Date.now()));
  }

  // Forex / metals (XAUUSD) — nearly 24h
  if (market === "forex" || market === "commodities" || exch === "forex") return true;

  return opts.marketStatus !== "CLOSED";
}

export function candleAlignForExchange(exchangeCode?: string | null, market?: string | null): CandleAlign {
  const exch = (exchangeCode ?? "").toLowerCase();
  const m = (market ?? "").toLowerCase();
  if (m === "india" || exch === "nse" || exch === "bse" || exch.includes("nse")) return "nse";
  return "utc";
}

/**
 * Snap an open_time to the canonical bar open for this timeframe / alignment.
 * Used to collapse Yahoo "tick tips" onto the real 5m/15m open.
 */
export function snapBarOpenMs(
  openMs: number,
  timeframe: string,
  align: CandleAlign = "utc",
): number {
  const tfMs = timeframeSeconds(timeframe) * 1000;
  if (align !== "nse") {
    return Math.floor(openMs / tfMs) * tfMs;
  }
  const bounds = nseSessionBounds(openMs);
  if (!bounds) {
    return Math.floor(openMs / tfMs) * tfMs;
  }
  const tfSec = timeframeSeconds(timeframe);
  if (tfSec >= 86400) return bounds.openMs;
  if (openMs < bounds.openMs) return bounds.openMs;
  if (openMs >= bounds.closeMs) {
    // After close — snap to last session bar open
    const last = bounds.closeMs - tfMs;
    return Math.max(bounds.openMs, last);
  }
  return bounds.openMs + Math.floor((openMs - bounds.openMs) / tfMs) * tfMs;
}

/**
 * Collapse misaligned opens (Yahoo forming-tick stamps) onto canonical bar opens,
 * then paint the current tip with the live quote.
 */
export function mergeLiveFormingCandle(
  candles: Candle[],
  timeframe: string,
  livePrice: number | null | undefined,
  nowMs = Date.now(),
  opts: LiveCandleOpts = {},
): Candle[] {
  if (!candles.length) return candles;
  const allowNewBar = opts.allowNewBar !== false;
  const align = opts.align ?? "utc";

  const sorted = [...candles].sort(
    (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
  );

  // 1) Coalesce history onto snapped opens (drops Yahoo tick-stamp duplicates).
  const buckets = new Map<number, Candle>();
  for (const c of sorted) {
    const raw = Date.parse(c.open_time);
    if (!Number.isFinite(raw)) continue;
    const openMs = snapBarOpenMs(raw, timeframe, align);
    const prev = buckets.get(openMs);
    if (!prev) {
      buckets.set(openMs, {
        ...c,
        open_time: new Date(openMs).toISOString(),
        close_time: new Date(openMs + timeframeSeconds(timeframe) * 1000 - 1).toISOString(),
      });
      continue;
    }
    const o = num(prev.open);
    buckets.set(openMs, {
      ...prev,
      high: Math.max(num(prev.high), num(c.high), o, num(c.open)),
      low: Math.min(num(prev.low), num(c.low), o, num(c.open)),
      close: num(c.close),
      volume: num(prev.volume) + num(c.volume),
      is_complete: prev.is_complete && c.is_complete,
    });
  }

  const coalesced = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c);

  if (!coalesced.length) return candles;

  const barOpenMs = currentBarOpenMs(timeframe, nowMs, align);
  const last = coalesced[coalesced.length - 1];
  const lastOpenMs = Date.parse(last.open_time);
  if (!Number.isFinite(lastOpenMs)) return coalesced;

  // Outside NSE session (or no bar): return cleaned history only
  if (barOpenMs == null) return coalesced;
  if (!allowNewBar && lastOpenMs !== barOpenMs) return coalesced;

  const closeMs = currentBarCloseMs(timeframe, nowMs, align)!;
  const barCloseMs = closeMs - 1;

  const fallback = num(last.close);
  const px =
    livePrice != null && Number.isFinite(livePrice) && livePrice > 0 ? livePrice : fallback;

  const history = coalesced.filter((c) => Date.parse(c.open_time) < barOpenMs);
  const windowBars = coalesced.filter((c) => {
    const t = Date.parse(c.open_time);
    return t >= barOpenMs && t < closeMs;
  });

  const paint = (open: number, high: number, low: number, base?: Candle): Candle => {
    const o = open;
    const h = Math.max(high, px, o);
    const l = Math.min(low, px, o);
    const template = base ?? last;
    return {
      ...template,
      open_time: new Date(barOpenMs).toISOString(),
      close_time: new Date(barCloseMs).toISOString(),
      open: o,
      high: h,
      low: l,
      close: px,
      is_complete: false,
    };
  };

  if (windowBars.length) {
    const exact = windowBars.find((c) => Date.parse(c.open_time) === barOpenMs) ?? windowBars[0];
    const o = num(exact.open);
    let h = o;
    let l = o;
    for (const b of windowBars) {
      h = Math.max(h, num(b.high), num(b.open), num(b.close));
      l = Math.min(l, num(b.low), num(b.open), num(b.close));
    }
    return [...history, paint(o, h, l, exact)];
  }

  if (allowNewBar && lastOpenMs < barOpenMs) {
    const tfMs = timeframeSeconds(timeframe) * 1000;
    const gapBars = Math.floor((barOpenMs - lastOpenMs) / tfMs);
    // History is missing (download lag). Do not invent a multi-day candle from the
    // last stored close → live LTP; wait for incremental download to fill the gap.
    if (gapBars > 1) {
      return coalesced;
    }
    const open = fallback;
    return [...coalesced, paint(open, open, open)];
  }

  // Tip still ahead after coalesce (rare) — force rebase onto current open
  if (allowNewBar && lastOpenMs > barOpenMs) {
    const open = num(last.open);
    return [...history, paint(open, num(last.high), num(last.low), last)];
  }

  return coalesced;
}
