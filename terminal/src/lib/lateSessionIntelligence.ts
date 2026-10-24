/**
 * Late Session Intelligence — evidence-based, never clock-only entries.
 * Analyzes opening range, VWAP, structure, volume, volatility, expiry context.
 * Allowed outcome: NO TRADE.
 */

import { num } from "./format";
import type { Candle, Levels, StructureEvents, Trend } from "./types";
import type { ExpiryIntelligence } from "./expiryIntelligence";

export type LateSessionClass =
  | "no_late_session_setup"
  | "bullish_continuation"
  | "bearish_continuation"
  | "bullish_breakout"
  | "bearish_breakdown"
  | "mean_reversion"
  | "expiry_driven_expansion"
  | "expiry_compression";

export interface LateSessionSetup {
  active: boolean;
  /** IST minutes from midnight when evaluated. */
  istMinutes: number;
  inLateWindow: boolean;
  classification: LateSessionClass;
  direction: "buy" | "sell" | "wait";
  confidence: number;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  riskPoints: number | null;
  rewardPoints: number | null;
  expectedMovePoints: number | null;
  expectedDurationMin: number | null;
  whyNow: string[];
  whatChanged: string[];
  invalidation: string;
  evidence: string[];
  openingRange: { high: number; low: number } | null;
  dayHigh: number | null;
  dayLow: number | null;
  vwap: number | null;
  distanceFromVwapPts: number | null;
  relativeVolume: number | null;
  summary: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Soft observational window — not a trigger. */
const LATE_WINDOW_START = 14 * 60 + 30; // 14:30 IST
const LATE_WINDOW_END = 15 * 60 + 25; // 15:25 IST

function istMinutesNow(now = new Date()): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function sessionCandles(candles: Candle[], now = new Date()): Candle[] {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const dayStart = Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET_MS;
  const dayEnd = Date.UTC(y, m, d, 23, 59, 59) - IST_OFFSET_MS;
  return candles.filter((c) => {
    const t = Date.parse(c.open_time);
    return t >= dayStart && t <= dayEnd;
  });
}

function openingRange(session: Candle[]): { high: number; low: number } | null {
  // First ~30–45 minutes of cash session (approx first 6–9 of 5m bars)
  const open = session.slice(0, Math.min(9, session.length));
  if (open.length < 3) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of open) {
    hi = Math.max(hi, num(c.high));
    lo = Math.min(lo, num(c.low));
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return { high: hi, low: lo };
}

function dayExtremes(session: Candle[]): { high: number; low: number } | null {
  if (!session.length) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of session) {
    hi = Math.max(hi, num(c.high));
    lo = Math.min(lo, num(c.low));
  }
  return { high: hi, low: lo };
}

function approxVwap(session: Candle[]): number | null {
  let pv = 0;
  let v = 0;
  for (const c of session) {
    const typ = (num(c.high) + num(c.low) + num(c.close)) / 3;
    const vol = Math.max(num(c.volume), 1);
    pv += typ * vol;
    v += vol;
  }
  return v > 0 ? pv / v : null;
}

function relativeVolume(session: Candle[]): number | null {
  if (session.length < 20) return null;
  const vols = session.map((c) => num(c.volume));
  const last = vols[vols.length - 1] ?? 0;
  const avg = vols.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, vols.length - 1);
  return avg > 0 ? last / avg : null;
}

function realizedVolExpanding(session: Candle[]): boolean {
  if (session.length < 24) return false;
  const ranges = session.map((c) => num(c.high) - num(c.low));
  const early = ranges.slice(0, Math.floor(ranges.length / 2));
  const late = ranges.slice(Math.floor(ranges.length / 2));
  const a = early.reduce((s, x) => s + x, 0) / early.length;
  const b = late.reduce((s, x) => s + x, 0) / late.length;
  return b > a * 1.15;
}

function recentStructureBias(events: StructureEvents | null | undefined): "bull" | "bear" | "none" {
  if (!events) return "none";
  const bos = (events.bos_events ?? []).slice(-3);
  const choch = (events.choch_events ?? []).slice(-3);
  const last = [...bos, ...choch].slice(-1)[0];
  if (!last) return "none";
  const t = (last.event_type ?? "").toLowerCase();
  if (t.includes("bull") || t.includes("up")) return "bull";
  if (t.includes("bear") || t.includes("down")) return "bear";
  return "none";
}

function emptySetup(partial: Partial<LateSessionSetup> & { istMinutes: number; inLateWindow: boolean }): LateSessionSetup {
  return {
    active: false,
    classification: "no_late_session_setup",
    direction: "wait",
    confidence: 0,
    entry: null,
    stop: null,
    tp1: null,
    tp2: null,
    rr: null,
    riskPoints: null,
    rewardPoints: null,
    expectedMovePoints: null,
    expectedDurationMin: null,
    whyNow: [],
    whatChanged: [],
    invalidation: "N/A — no late-session setup.",
    evidence: [],
    openingRange: null,
    dayHigh: null,
    dayLow: null,
    vwap: null,
    distanceFromVwapPts: null,
    relativeVolume: null,
    summary: "NO TRADE — insufficient late-session evidence.",
    ...partial,
  };
}

/**
 * Analyze late-session market state. Clock only defines observation window —
 * never a standalone BUY/SELL reason.
 */
export function analyzeLateSession(opts: {
  candles: Candle[];
  trend?: Trend | null;
  levels?: Levels | null;
  structureEvents?: StructureEvents | null;
  expiry?: ExpiryIntelligence | null;
  now?: Date;
}): LateSessionSetup {
  const now = opts.now ?? new Date();
  const mins = istMinutesNow(now);
  const inLateWindow = mins >= LATE_WINDOW_START && mins <= LATE_WINDOW_END;
  const session = sessionCandles(opts.candles, now);
  const or = openingRange(session);
  const ext = dayExtremes(session);
  const vwap = approxVwap(session);
  const px = session.length ? num(session[session.length - 1].close) : null;
  const rv = relativeVolume(session);
  const volExp = realizedVolExpanding(session);
  const structBias = recentStructureBias(opts.structureEvents);
  const trendTone = opts.trend?.trend?.toLowerCase() ?? "";

  const base = emptySetup({
    istMinutes: mins,
    inLateWindow,
    openingRange: or,
    dayHigh: ext?.high ?? null,
    dayLow: ext?.low ?? null,
    vwap,
    distanceFromVwapPts: px != null && vwap != null ? Math.round((px - vwap) * 100) / 100 : null,
    relativeVolume: rv != null ? Math.round(rv * 100) / 100 : null,
  });

  if (!inLateWindow) {
    return {
      ...base,
      summary: "Outside late-session observation window (14:30–15:25 IST). No clock-based trade.",
      evidence: ["Not in late-session window — analysis idle."],
    };
  }

  if (px == null || !or || !ext || session.length < 12) {
    return {
      ...base,
      summary: "NO TRADE — incomplete session data for late-session analysis.",
      evidence: ["Need opening range + day extremes + enough bars."],
    };
  }

  const evidence: string[] = [];
  const whyNow: string[] = [];
  const whatChanged: string[] = [];
  let scoreBull = 0;
  let scoreBear = 0;

  const aboveVwap = vwap != null && px > vwap;
  const belowVwap = vwap != null && px < vwap;
  const distVwap = vwap != null ? Math.abs(px - vwap) : 0;

  if (aboveVwap) {
    scoreBull += 1;
    evidence.push(`Price above VWAP by ${distVwap.toFixed(1)} pts`);
  }
  if (belowVwap) {
    scoreBear += 1;
    evidence.push(`Price below VWAP by ${distVwap.toFixed(1)} pts`);
  }

  if (px > or.high) {
    scoreBull += 2;
    evidence.push("Price above opening-range high");
    whatChanged.push("Opening-range break to upside");
  }
  if (px < or.low) {
    scoreBear += 2;
    evidence.push("Price below opening-range low");
    whatChanged.push("Opening-range break to downside");
  }

  if (trendTone.includes("up") || trendTone.includes("bull")) {
    scoreBull += 1;
    evidence.push(`Trend: ${opts.trend?.trend}`);
  }
  if (trendTone.includes("down") || trendTone.includes("bear")) {
    scoreBear += 1;
    evidence.push(`Trend: ${opts.trend?.trend}`);
  }

  if (structBias === "bull") {
    scoreBull += 2;
    evidence.push("Recent BOS/CHoCH bullish");
    whatChanged.push("Bullish structure print");
  }
  if (structBias === "bear") {
    scoreBear += 2;
    evidence.push("Recent BOS/CHoCH bearish");
    whatChanged.push("Bearish structure print");
  }

  if (rv != null && rv >= 1.25) {
    evidence.push(`Relative volume ${rv.toFixed(2)}x`);
    if (scoreBull >= scoreBear) scoreBull += 1;
    else scoreBear += 1;
    whatChanged.push("Volume expansion");
  }

  if (volExp) {
    evidence.push("Realized range expanding into late session");
    whatChanged.push("Volatility expansion");
  }

  const nearDayHigh = Math.abs(ext.high - px) <= Math.max(8, (ext.high - ext.low) * 0.08);
  const nearDayLow = Math.abs(px - ext.low) <= Math.max(8, (ext.high - ext.low) * 0.08);
  if (nearDayHigh && belowVwap) {
    scoreBear += 1;
    evidence.push("Near day high but below VWAP — rejection risk");
  }
  if (nearDayLow && aboveVwap) {
    scoreBull += 1;
    evidence.push("Near day low but above VWAP — bounce risk");
  }

  // Support / resistance from nearest dynamic levels
  const resLvl = opts.levels?.resistance_levels?.[0];
  const supLvl = opts.levels?.support_levels?.[0];
  const res = resLvl != null ? num(resLvl.price) : null;
  const sup = supLvl != null ? num(supLvl.price) : null;
  if (res != null && px < res && Math.abs(res - px) < 25) {
    scoreBear += 1;
    evidence.push(`Under resistance ${res.toFixed(1)}`);
  }
  if (sup != null && px > sup && Math.abs(px - sup) < 25) {
    scoreBull += 1;
    evidence.push(`Above support ${sup.toFixed(1)}`);
  }

  let classification: LateSessionClass = "no_late_session_setup";
  if (opts.expiry?.active && opts.expiry.compressing && !volExp) {
    classification = "expiry_compression";
    evidence.push("Expiry compression (realized-vol proxy) — NO forced trade");
  } else if (opts.expiry?.active && volExp && (scoreBull >= 5 || scoreBear >= 5)) {
    classification = "expiry_driven_expansion";
    evidence.push("Expiry + expansion evidence");
  } else if (px > or.high && scoreBull >= 5) {
    classification = "bullish_breakout";
  } else if (px < or.low && scoreBear >= 5) {
    classification = "bearish_breakdown";
  } else if (scoreBull >= 5 && aboveVwap) {
    classification = "bullish_continuation";
  } else if (scoreBear >= 5 && belowVwap) {
    classification = "bearish_continuation";
  } else if (
    (nearDayHigh && scoreBear >= 4) ||
    (nearDayLow && scoreBull >= 4)
  ) {
    classification = "mean_reversion";
  }

  const bullish =
    classification === "bullish_breakout" ||
    classification === "bullish_continuation" ||
    (classification === "mean_reversion" && nearDayLow) ||
    (classification === "expiry_driven_expansion" && scoreBull > scoreBear);

  const bearish =
    classification === "bearish_breakdown" ||
    classification === "bearish_continuation" ||
    (classification === "mean_reversion" && nearDayHigh) ||
    (classification === "expiry_driven_expansion" && scoreBear > scoreBull);

  const strongEnough = Math.max(scoreBull, scoreBear) >= 5 && (bullish || bearish);
  if (
    !strongEnough ||
    classification === "no_late_session_setup" ||
    classification === "expiry_compression"
  ) {
    return {
      ...base,
      classification:
        classification === "expiry_compression" ? classification : "no_late_session_setup",
      evidence,
      whyNow: ["No high-conviction late-session evidence — NO TRADE."],
      whatChanged,
      summary:
        classification === "expiry_compression"
          ? "NO TRADE — expiry compression without expansion evidence."
          : "NO TRADE — late-session state lacks multi-factor conviction.",
      confidence: Math.min(40, Math.max(scoreBull, scoreBear) * 6),
    };
  }

  const direction: "buy" | "sell" = bullish ? "buy" : "sell";
  // Structural SL: OR opposite / VWAP / day extreme — never clock-invented
  let stop: number;
  if (bullish) {
    stop = Math.min(or.low, vwap ?? or.low, nearDayLow ? ext.low : or.low);
    if (stop >= px) stop = px - Math.max(8, (ext.high - ext.low) * 0.05);
  } else {
    stop = Math.max(or.high, vwap ?? or.high, nearDayHigh ? ext.high : or.high);
    if (stop <= px) stop = px + Math.max(8, (ext.high - ext.low) * 0.05);
  }
  const risk = Math.abs(px - stop);
  if (!(risk > 0) || risk > 40) {
    return {
      ...base,
      classification: "no_late_session_setup",
      evidence: [...evidence, `Structural risk ${risk.toFixed(1)} pts not usable`],
      whyNow: ["Risk geometry invalid — NO TRADE."],
      whatChanged,
      summary: "NO TRADE — structural SL not usable for late session.",
      confidence: 30,
    };
  }
  // Structural TP: day extreme / OR extreme — do NOT invent TP just to clear RR
  const structuralTp = bullish ? Math.max(ext.high, or.high) : Math.min(ext.low, or.low);
  const reward = Math.abs(structuralTp - px);
  const rr = risk > 0 ? reward / risk : 0;
  const minRr = 2.0;
  if (rr + 1e-9 < minRr) {
    return {
      ...base,
      classification: "no_late_session_setup",
      evidence: [
        ...evidence,
        `Structural RR ${rr.toFixed(2)} < ${minRr} (reward ${reward.toFixed(1)} / risk ${risk.toFixed(1)}) — will not invent TP`,
      ],
      whyNow: ["Late-session structural target cannot clear 1:2 — NO TRADE."],
      whatChanged,
      summary: "NO TRADE — structural target does not clear 1:2 RR.",
      confidence: 35,
      entry: Math.round(px * 100) / 100,
      stop: Math.round(stop * 100) / 100,
      tp1: Math.round(structuralTp * 100) / 100,
      rr: Math.round(rr * 100) / 100,
      riskPoints: Math.round(risk * 100) / 100,
      rewardPoints: Math.round(reward * 100) / 100,
    };
  }
  const tp1 = structuralTp;
  const tp2 = bullish ? px + 3 * risk : px - 3 * risk;
  const conf = Math.min(
    78,
    45 + Math.max(scoreBull, scoreBear) * 5 + (volExp ? 5 : 0) + (opts.expiry?.active ? 3 : 0),
  );

  whyNow.push(
    `${classification.replace(/_/g, " ")} with score B${scoreBull}/S${scoreBear}`,
    `VWAP ${vwap?.toFixed(1) ?? "n/a"} · OR ${or.low.toFixed(1)}–${or.high.toFixed(1)}`,
  );
  if (rv != null && rv >= 1.25) whyNow.push("Volume supports move");
  if (structBias !== "none") whyNow.push(`Structure bias ${structBias}`);

  return {
    active: true,
    istMinutes: mins,
    inLateWindow: true,
    classification,
    direction,
    confidence: conf,
    entry: Math.round(px * 100) / 100,
    stop: Math.round(stop * 100) / 100,
    tp1: Math.round(tp1 * 100) / 100,
    tp2: Math.round(tp2 * 100) / 100,
    rr: Math.round(rr * 100) / 100,
    riskPoints: Math.round(risk * 100) / 100,
    rewardPoints: Math.round(reward * 100) / 100,
    expectedMovePoints: Math.round(reward * 100) / 100,
    expectedDurationMin: 15,
    whyNow,
    whatChanged: whatChanged.length ? whatChanged : ["Multi-factor late-session alignment"],
    invalidation: bullish
      ? `Price reclaims below ${stop.toFixed(1)} with bearish structure.`
      : `Price reclaims above ${stop.toFixed(1)} with bullish structure.`,
    evidence,
    openingRange: or,
    dayHigh: ext.high,
    dayLow: ext.low,
    vwap,
    distanceFromVwapPts: Math.round((px - (vwap ?? px)) * 100) / 100,
    relativeVolume: rv != null ? Math.round(rv * 100) / 100 : null,
    summary: `${direction.toUpperCase()} late-session · RR ${rr.toFixed(2)} · conf ${conf} (evidence-based, not clock-based)`,
  };
}
