/**
 * India index F&O expiry calendar (2025+ SEBI weekly regime).
 * NIFTY weekly: Tuesday · BANKNIFTY: monthly last Tuesday · SENSEX weekly: Thursday.
 * Holiday → previous weekday (no hardcoded “3 PM move”).
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Sparse NSE/BSE holiday list (extend as needed). YYYY-MM-DD IST calendar dates. */
const MARKET_HOLIDAYS = new Set([
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-08-15",
  "2026-10-02",
  "2026-10-20",
  "2026-11-08",
  "2026-12-25",
]);

export type ExpiryKind = "weekly" | "monthly" | "none";

export interface ExpirySchedule {
  symbol: string;
  kind: ExpiryKind;
  /** true when `now` is on that contract's expiry session (IST date). */
  isExpiryDay: boolean;
  /** Scheduled expiry date YYYY-MM-DD (IST), after holiday shift. */
  expiryDate: string | null;
  label: string;
}

function istParts(d: Date) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: ist.getUTCFullYear(),
    m: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    dow: ist.getUTCDay(),
  };
}

function istYmd(d: Date): string {
  const p = istParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function fromIstYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0) - IST_OFFSET_MS);
}

function isWeekend(ymd: string): boolean {
  const dow = istParts(fromIstYmd(ymd)).dow;
  return dow === 0 || dow === 6;
}

function isHoliday(ymd: string): boolean {
  return MARKET_HOLIDAYS.has(ymd) || isWeekend(ymd);
}

/** Shift expiry to previous weekday if holiday/weekend. */
export function adjustExpiryDate(ymd: string): string {
  let cur = ymd;
  for (let i = 0; i < 10; i++) {
    if (!isHoliday(cur)) return cur;
    const p = istParts(fromIstYmd(cur));
    const prev = new Date(Date.UTC(p.y, p.m, p.day - 1, 12, 0, 0) - IST_OFFSET_MS);
    cur = istYmd(prev);
  }
  return cur;
}

function lastWeekdayOfMonth(y: number, month0: number, weekday: number): string {
  // Find last calendar day of month in IST terms via UTC noon probe
  const lastDom = new Date(Date.UTC(y, month0 + 1, 0, 6, 30, 0)); // ~noon IST
  let ymd = `${lastDom.getUTCFullYear()}-${String(lastDom.getUTCMonth() + 1).padStart(2, "0")}-${String(lastDom.getUTCDate()).padStart(2, "0")}`;
  for (let i = 0; i < 10; i++) {
    const p = istParts(fromIstYmd(ymd));
    if (p.dow === weekday && !MARKET_HOLIDAYS.has(ymd)) return adjustExpiryDate(ymd);
    const prev = fromIstYmd(ymd);
    const ist = new Date(prev.getTime() + IST_OFFSET_MS);
    ist.setUTCDate(ist.getUTCDate() - 1);
    ymd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
  }
  return adjustExpiryDate(ymd);
}

function nextOrSameWeekday(from: Date, weekday: number): string {
  const p = istParts(from);
  let delta = (weekday - p.dow + 7) % 7;
  const d = fromIstYmd(istYmd(from));
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  ist.setUTCDate(ist.getUTCDate() + delta);
  const ymd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
  return adjustExpiryDate(ymd);
}

function normalizeCode(code: string): string {
  const c = code.toUpperCase().replace(/\s+/g, "");
  if (c === "NIFTY" || c === "NIFTY50" || c === "^NSEI") return "NIFTY50";
  if (c === "BANKNIFTY" || c === "NIFTYBANK") return "BANKNIFTY";
  if (c === "SENSEX" || c === "^BSESN") return "SENSEX";
  return c;
}

/**
 * Resolve whether this symbol has an F&O expiry session today (IST).
 */
export function getExpirySchedule(symbolCode: string, now = new Date()): ExpirySchedule {
  const symbol = normalizeCode(symbolCode);
  const today = istYmd(now);

  if (symbol === "NIFTY50") {
    const weekly = nextOrSameWeekday(now, 2); // Tuesday
    const monthly = lastWeekdayOfMonth(istParts(now).y, istParts(now).m, 2);
    const isWeekly = weekly === today;
    const isMonthly = monthly === today;
    return {
      symbol,
      kind: isMonthly ? "monthly" : isWeekly ? "weekly" : "none",
      isExpiryDay: isWeekly || isMonthly,
      expiryDate: isMonthly || isWeekly ? today : weekly,
      label: isMonthly
        ? "NIFTY monthly + weekly expiry"
        : isWeekly
          ? "NIFTY weekly expiry"
          : `Next NIFTY expiry ${weekly}`,
    };
  }

  if (symbol === "BANKNIFTY") {
    const monthly = lastWeekdayOfMonth(istParts(now).y, istParts(now).m, 2);
    const isMonthly = monthly === today;
    return {
      symbol,
      kind: isMonthly ? "monthly" : "none",
      isExpiryDay: isMonthly,
      expiryDate: monthly,
      label: isMonthly ? "BANKNIFTY monthly expiry" : `Next BANKNIFTY monthly ${monthly}`,
    };
  }

  if (symbol === "SENSEX") {
    const weekly = nextOrSameWeekday(now, 4); // Thursday
    const isWeekly = weekly === today;
    return {
      symbol,
      kind: isWeekly ? "weekly" : "none",
      isExpiryDay: isWeekly,
      expiryDate: isWeekly ? today : weekly,
      label: isWeekly ? "SENSEX weekly expiry" : `Next SENSEX expiry ${weekly}`,
    };
  }

  return {
    symbol,
    kind: "none",
    isExpiryDay: false,
    expiryDate: null,
    label: "No index F&O expiry calendar for this symbol",
  };
}

export function isIndexExpirySymbol(symbolCode: string): boolean {
  const s = normalizeCode(symbolCode);
  return s === "NIFTY50" || s === "BANKNIFTY" || s === "SENSEX";
}
