export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const isNum = (v: unknown): v is number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n);
};

export function fmtPrice(value: unknown): string {
  const n = num(value);
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

export function fmtNum(value: unknown, digits = 2): string {
  return num(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function fmtPct(value: unknown, digits = 1): string {
  return `${num(value).toFixed(digits)}%`;
}

export function fmtSignedPct(value: unknown, digits = 2): string {
  const n = num(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function fmtCompact(value: unknown): string {
  const n = num(value);
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Distance from current price to a level (absolute + signed %). */
export function fmtDistance(from: number, to: number): { abs: string; pct: string; raw: number; rawPct: number } {
  const diff = to - from;
  const pct = from !== 0 ? (diff / from) * 100 : 0;
  return {
    abs: `${diff >= 0 ? "+" : ""}${fmtPrice(diff)}`,
    pct: fmtSignedPct(pct),
    raw: diff,
    rawPct: pct,
  };
}

export type Tone = "bull" | "bear" | "neutral" | "warn" | "info" | "brand";

export function directionTone(value: string | null | undefined): "bull" | "bear" | "neutral" {
  const v = (value ?? "").toLowerCase();
  if (["bull", "bullish", "long", "up", "uptrend", "buy"].some((k) => v.includes(k))) return "bull";
  if (["bear", "bearish", "short", "down", "downtrend", "sell"].some((k) => v.includes(k))) return "bear";
  return "neutral";
}

/** Map a trend string + confidence into a five-level natural-language label. */
export function trendLabel(trend: string | null | undefined, confidence: number): string {
  const tone = directionTone(trend);
  if (tone === "neutral") return "Neutral";
  const strong = confidence >= 70;
  if (tone === "bull") return strong ? "Strong Bullish" : "Bullish";
  return strong ? "Strong Bearish" : "Bearish";
}

export function confidenceLabel(score: number): { label: string; tone: Tone } {
  if (score >= 80) return { label: "Excellent", tone: "bull" };
  if (score >= 65) return { label: "Strong", tone: "bull" };
  if (score >= 50) return { label: "Moderate", tone: "info" };
  if (score >= 35) return { label: "Weak", tone: "warn" };
  return { label: "Low", tone: "bear" };
}

export function riskRating(rr: number | null | undefined): { label: string; tone: Tone } {
  const v = num(rr);
  if (!rr) return { label: "Unrated", tone: "neutral" };
  if (v >= 3) return { label: "Favorable", tone: "bull" };
  if (v >= 2) return { label: "Balanced", tone: "info" };
  if (v >= 1) return { label: "Tight", tone: "warn" };
  return { label: "High Risk", tone: "bear" };
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
