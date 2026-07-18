/**
 * Chart time helpers — candles are stored as UTC instants.
 * Axis/tooltip labels follow exchange convention (TradingView-style):
 *   Binance → UTC
 *   NSE/BSE → Asia/Kolkata (IST, no DST)
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

export function chartTzForExchange(exchangeCode?: string | null): ChartTz {
  const c = (exchangeCode ?? "").toLowerCase();
  if (c === "nse" || c === "bse") return "Asia/Kolkata";
  return "UTC";
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function partsInTz(sec: number, tz: ChartTz) {
  // IST has no DST — shift by +5:30 then read UTC fields.
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

/** Crosshair / tooltip label — exchange timezone. */
export function formatChartTime(time: Time, tz: ChartTz = "UTC"): string {
  const sec = typeof time === "number" ? time : 0;
  const p = partsInTz(sec, tz);
  return `${pad(p.day)} ${MONTHS[p.mo - 1]} '${String(p.y).slice(2)}  ${pad(p.h)}:${pad(p.mi)}`;
}

/** Axis tick labels — exchange timezone. */
export function formatTickMark(time: Time, tickMarkType: TickMarkType, tz: ChartTz = "UTC"): string {
  const sec = typeof time === "number" ? time : 0;
  const p = partsInTz(sec, tz);
  switch (tickMarkType) {
    case TickMarkType.Year:
      return String(p.y);
    case TickMarkType.Month:
      return `${MONTHS[p.mo - 1]} ${p.y}`;
    case TickMarkType.DayOfMonth:
      return `${pad(p.day)} ${MONTHS[p.mo - 1]}`;
    case TickMarkType.Time:
    case TickMarkType.TimeWithSeconds:
      return `${pad(p.h)}:${pad(p.mi)}`;
    default:
      return `${pad(p.h)}:${pad(p.mi)}`;
  }
}

/** @deprecated use formatChartTime */
export const formatChartTimeUtc = (time: Time) => formatChartTime(time, "UTC");
/** @deprecated use formatTickMark */
export const formatTickMarkUtc = (time: Time, t: TickMarkType) => formatTickMark(time, t, "UTC");
