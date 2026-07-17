/** Session clocks for Morning Brief (IST-aware). No fabricated news. */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIstParts(d = new Date()) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: ist.getUTCFullYear(),
    m: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    dow: ist.getUTCDay(),
    h: ist.getUTCHours(),
    min: ist.getUTCMinutes(),
    sec: ist.getUTCSeconds(),
  };
}

function istWallToUtc(y: number, m: number, day: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m, day, h, min, 0) - IST_OFFSET_MS);
}

function addIstDays(base: Date, days: number): Date {
  const p = toIstParts(base);
  return istWallToUtc(p.y, p.m, p.day + days, 9, 15);
}

/** Next NSE cash open (09:15 IST Mon–Fri). */
export function nextIndiaOpen(now = new Date()): Date {
  if (isIndiaSessionOpen(now)) return now;

  const p = toIstParts(now);
  let candidate = istWallToUtc(p.y, p.m, p.day, 9, 15);

  for (let i = 0; i < 8; i++) {
    const cp = toIstParts(candidate);
    const isWeekday = cp.dow >= 1 && cp.dow <= 5;
    if (isWeekday && candidate > now) return candidate;
    candidate = addIstDays(candidate, 1);
  }
  return candidate;
}

export function isIndiaSessionOpen(now = new Date()): boolean {
  const p = toIstParts(now);
  if (p.dow === 0 || p.dow === 6) return false;
  const open = istWallToUtc(p.y, p.m, p.day, 9, 15);
  const close = istWallToUtc(p.y, p.m, p.day, 15, 30);
  return now >= open && now < close;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export type Greeting = "Good Morning" | "Good Afternoon" | "Good Evening";

export function greetingForNow(now = new Date()): Greeting {
  const h = toIstParts(now).h;
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export interface CalendarEvent {
  id: string;
  title: string;
  market: string;
  timeLabel: string;
  impact: "high" | "medium";
}
