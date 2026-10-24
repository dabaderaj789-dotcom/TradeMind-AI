/**
 * Chart time helpers — candles are stored as UTC instants.
 * Axis/tooltip labels are IST (Asia/Kolkata) so they match TradingView
 * as used by Indian traders and the terminal’s IST clock.
 */

import type { Time, UTCTimestamp } from "lightweight-charts";
import { TickMarkType } from "lightweight-charts";

export type ChartTz = "UTC" | "Asia/Kolkata";

/** Parse API ISO open_time → UTC unix seconds for Lightweight Charts. */
export function toChartTime(iso: string): UTCTimestamp {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0 as UTCTimestamp;
  return Math.floor(ms / 1000) as UTCTimestamp;
}

/**
 * Display timezone for axis + crosshair.
 * Always IST — product clock is IST; TradingView India setups use local/IST.
 */
export function chartTzForExchange(_exchangeCode?: string | null): ChartTz {
  return "Asia/Kolkata";
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function partsInTz(sec: number, tz: ChartTz) {
  const offsetMs = tz === "Asia/Kolkata" ? 5.5 * 3600 * 1000 : 0;
  const d = new Date(sec * 1000 + offsetMs);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Crosshair / tooltip — TradingView style: `20 Jul 17:15`. */
export function formatChartTime(time: Time, tz: ChartTz = "Asia/Kolkata"): string {
  const sec = typeof time === "number" ? time : 0;
  const p = partsInTz(sec, tz);
  return `${pad(p.day)} ${MONTHS[p.mo - 1]}  ${pad(p.h)}:${pad(p.mi)}`;
}

/**
 * Axis tick labels — dense HH:MM on intraday (like TradingView 15m),
 * date on day boundaries.
 */
export function formatTickMark(time: Time, tickMarkType: TickMarkType, tz: ChartTz = "Asia/Kolkata"): string {
  const sec = typeof time === "number" ? time : 0;
  const p = partsInTz(sec, tz);
  switch (tickMarkType) {
    case TickMarkType.Year:
      return String(p.y);
    case TickMarkType.Month:
      return `${MONTHS[p.mo - 1]} '${String(p.y).slice(2)}`;
    case TickMarkType.DayOfMonth:
      return `${pad(p.day)} ${MONTHS[p.mo - 1]}`;
    case TickMarkType.Time:
    case TickMarkType.TimeWithSeconds:
      // At midnight show the date so the day change is obvious
      if (p.h === 0 && p.mi === 0) return `${pad(p.day)} ${MONTHS[p.mo - 1]}`;
      return `${pad(p.h)}:${pad(p.mi)}`;
    default:
      return `${pad(p.h)}:${pad(p.mi)}`;
  }
}

/** @deprecated use formatChartTime */
export const formatChartTimeUtc = (time: Time) => formatChartTime(time, "UTC");
/** @deprecated use formatTickMark */
export const formatTickMarkUtc = (time: Time, t: TickMarkType) => formatTickMark(time, t, "UTC");
