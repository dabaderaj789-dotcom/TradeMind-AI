/**
 * Expiry Intelligence — activates only on index F&O expiry days.
 * Uses price structure + realized volatility proxies.
 * Does NOT assume a move because of clock time (no “3 PM” rules).
 */

import type { AiDecision } from "./decision";
import { getExpirySchedule, type ExpirySchedule } from "./expiryCalendar";
import { num } from "./format";
import type { Candle, Trend } from "./types";

export type ExpiryDayClass =
  | "Trend Day"
  | "Range Day"
  | "Breakout Day"
  | "Mean Reversion Day"
  | "Expiry Compression";

export type PremiumDecayBias = "helps_buyer" | "hurts_buyer" | "mixed" | "unknown";
export type VolRegime = "expanding" | "contracting" | "stable" | "unknown";

export interface ExpiryIntelligence {
  active: boolean;
  schedule: ExpirySchedule;
  dayClass: ExpiryDayClass | null;
  /** Realized-vol path — option IV only if we later wire a chain feed. */
  realizedVol: VolRegime;
  ivNote: string;
  premiumDecay: PremiumDecayBias;
  premiumNote: string;
  compressing: boolean;
  directionalLikelihood: "rising" | "fading" | "unclear";
  trending: boolean;
  rangeBound: boolean;
  lateSessionOpportunity: boolean;
  lateSessionEvidence: string[];
  summary: string;
  /** Explanations attached to every decision on expiry. */
  decisionNotes: {
    whyForExpiry: string;
    premiumImpact: string;
    invalidate: string;
  };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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

function atrSeries(candles: Candle[], lookback: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = num(candles[i].high);
    const l = num(candles[i].low);
    const pc = num(candles[i - 1].close);
    out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (out.length < lookback) return out;
  const smoothed: number[] = [];
  for (let i = lookback - 1; i < out.length; i++) {
    const slice = out.slice(i - lookback + 1, i + 1);
    smoothed.push(slice.reduce((a, b) => a + b, 0) / lookback);
  }
  return smoothed;
}

function efficiencyRatio(candles: Candle[]): number {
  if (candles.length < 8) return 0;
  const start = num(candles[0].close);
  const end = num(candles[candles.length - 1].close);
  let path = 0;
  for (let i = 1; i < candles.length; i++) {
    path += Math.abs(num(candles[i].close) - num(candles[i - 1].close));
  }
  if (path <= 0) return 0;
  return Math.abs(end - start) / path;
}

function rangePct(candles: Candle[]): number {
  if (!candles.length) return 0;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of candles) {
    hi = Math.max(hi, num(c.high));
    lo = Math.min(lo, num(c.low));
  }
  const mid = (hi + lo) / 2;
  return mid > 0 ? ((hi - lo) / mid) * 100 : 0;
}

function classifyDay(opts: {
  er: number;
  rangePct: number;
  compressing: boolean;
  vol: VolRegime;
  brokeRange: boolean;
  meanRevertScore: number;
}): ExpiryDayClass {
  const { er, compressing, vol, brokeRange, meanRevertScore } = opts;
  if (compressing && vol === "contracting") return "Expiry Compression";
  if (brokeRange && vol === "expanding") return "Breakout Day";
  if (er >= 0.42) return "Trend Day";
  if (meanRevertScore >= 0.55 && er < 0.28) return "Mean Reversion Day";
  return "Range Day";
}

/**
 * Build expiry intelligence for the current IST session.
 * Inactive when not an expiry day for this symbol.
 */
export function analyzeExpirySession(opts: {
  symbolCode: string;
  candles: Candle[];
  trend?: Trend | null;
  now?: Date;
}): ExpiryIntelligence {
  const now = opts.now ?? new Date();
  const schedule = getExpirySchedule(opts.symbolCode, now);

  const inactive = (): ExpiryIntelligence => ({
    active: false,
    schedule,
    dayClass: null,
    realizedVol: "unknown",
    ivNote: "Expiry Intelligence idle — not an F&O expiry session for this symbol.",
    premiumDecay: "unknown",
    premiumNote: "—",
    compressing: false,
    directionalLikelihood: "unclear",
    trending: false,
    rangeBound: false,
    lateSessionOpportunity: false,
    lateSessionEvidence: [],
    summary: schedule.label,
    decisionNotes: {
      whyForExpiry: "Not an expiry session.",
      premiumImpact: "N/A",
      invalidate: "N/A",
    },
  });

  if (!schedule.isExpiryDay) return inactive();

  const day = sessionCandles(opts.candles, now);
  const bars = day.length >= 12 ? day : opts.candles.slice(-80);
  if (bars.length < 10) {
    return {
      ...inactive(),
      active: true,
      summary: `${schedule.label} — waiting for enough session bars.`,
      ivNote: "Option-chain IV not connected. Need more candles for realized-vol proxy.",
      decisionNotes: {
        whyForExpiry: "Expiry day active but session sample is still thin — prefer WAIT until structure forms.",
        premiumImpact: "Theta is elevated on expiry; thin structure → option buyers are disadvantaged until a clear expansion.",
        invalidate: "Any impulsive range expansion with rising volume would change this stance.",
      },
    };
  }

  const atr = atrSeries(bars, Math.min(14, Math.max(5, Math.floor(bars.length / 4))));
  const early = atr.slice(0, Math.max(3, Math.floor(atr.length / 3)));
  const late = atr.slice(-Math.max(3, Math.floor(atr.length / 3)));
  const earlyAvg = early.reduce((a, b) => a + b, 0) / Math.max(early.length, 1);
  const lateAvg = late.reduce((a, b) => a + b, 0) / Math.max(late.length, 1);
  const volRatio = earlyAvg > 0 ? lateAvg / earlyAvg : 1;

  let realizedVol: VolRegime = "stable";
  if (volRatio >= 1.18) realizedVol = "expanding";
  else if (volRatio <= 0.85) realizedVol = "contracting";

  const er = efficiencyRatio(bars);
  const rng = rangePct(bars);
  const recent = bars.slice(-Math.max(8, Math.floor(bars.length / 5)));
  const recentRange = rangePct(recent);
  const compressing = recentRange < rng * 0.55 && realizedVol !== "expanding";

  // Breakout: last close outside prior session balance (ex-last 10 bars)
  const balance = bars.slice(0, -Math.min(10, Math.floor(bars.length / 4)));
  let balHi = -Infinity;
  let balLo = Infinity;
  for (const c of balance) {
    balHi = Math.max(balHi, num(c.high));
    balLo = Math.min(balLo, num(c.low));
  }
  const last = num(bars[bars.length - 1].close);
  const brokeRange = balance.length > 5 && (last > balHi || last < balLo);

  // Mean-reversion score: oscillate around VWAP-ish mid
  let midSum = 0;
  for (const c of bars) midSum += (num(c.high) + num(c.low) + num(c.close)) / 3;
  const sessionMid = midSum / bars.length;
  const crosses = bars.filter((c, i) => {
    if (i === 0) return false;
    const a = num(bars[i - 1].close) - sessionMid;
    const b = num(c.close) - sessionMid;
    return a === 0 || b === 0 || a * b < 0;
  }).length;
  const meanRevertScore = clamp(crosses / Math.max(bars.length / 4, 1), 0, 1);

  const trending = er >= 0.38 || (opts.trend?.confidence ?? 0) >= 62;
  const rangeBound = !trending && !brokeRange;

  const dayClass = classifyDay({
    er,
    rangePct: rng,
    compressing,
    vol: realizedVol,
    brokeRange,
    meanRevertScore,
  });

  let directionalLikelihood: ExpiryIntelligence["directionalLikelihood"] = "unclear";
  if (brokeRange && realizedVol === "expanding") directionalLikelihood = "rising";
  else if (compressing && realizedVol === "contracting") directionalLikelihood = "rising"; // coiled
  else if (rangeBound && realizedVol === "contracting") directionalLikelihood = "fading";

  // Premium decay bias for option buyers (theta) — structure-based, not clock-based
  let premiumDecay: PremiumDecayBias = "mixed";
  let premiumNote = "";
  if (dayClass === "Expiry Compression" || dayClass === "Range Day") {
    premiumDecay = "hurts_buyer";
    premiumNote =
      "INDEX MOVEMENT: range/compression. OPTION PREMIUM: realized-vol proxy suggests decay pressure on long premium — NOT measured theta/IV. Wire option LTP series for true premium decay.";
  } else if (dayClass === "Breakout Day" || (dayClass === "Trend Day" && realizedVol === "expanding")) {
    premiumDecay = "helps_buyer";
    premiumNote =
      "INDEX MOVEMENT: expansion/trend. OPTION PREMIUM: long options MAY expand IF direction is correct — claim only after comparing option LTP vs underlying path. IV/theta not measured here.";
  } else if (dayClass === "Mean Reversion Day") {
    premiumDecay = "hurts_buyer";
    premiumNote =
      "INDEX MOVEMENT: mean reversion. OPTION PREMIUM: ATM premium often bleeds on expiry — proxy only until option LTP path is analyzed.";
  } else {
    premiumDecay = "mixed";
    premiumNote =
      "INDEX vs OPTION PREMIUM: mixed realized-vol regime — do not claim theta decay without option LTP/IV series.";
  }

  // Late-session opportunity ONLY from evidence (structure/vol/liquidity), never from wall-clock.
  const lateSessionEvidence: string[] = [];
  if (compressing && brokeRange) {
    lateSessionEvidence.push("Compression resolved with a range break — structure breakout evidence");
  }
  if (realizedVol === "expanding" && er >= 0.4) {
    lateSessionEvidence.push("Realized volatility expanding with high path efficiency (trend day signature)");
  }
  if (brokeRange) {
    lateSessionEvidence.push(
      last > balHi ? "Price accepted above session balance high" : "Price accepted below session balance low",
    );
  }
  const lateSessionOpportunity = lateSessionEvidence.length >= 2;

  const ivNote =
    "OPTION IV: Unavailable from current provider path. INDEX realized-volatility (ATR path) is a PROXY only — not theta, not IV crush.";

  const summary = `${schedule.label} · ${dayClass} · RV ${realizedVol} · ${
    compressing ? "compressing" : "not compressing"
  } · directional ${directionalLikelihood}`;

  const decisionNotes = {
    whyForExpiry: buildWhyForExpiry(dayClass, schedule, trending, rangeBound, compressing),
    premiumImpact: premiumNote,
    invalidate: buildInvalidate(dayClass, brokeRange),
  };

  return {
    active: true,
    schedule,
    dayClass,
    realizedVol,
    ivNote,
    premiumDecay,
    premiumNote,
    compressing,
    directionalLikelihood,
    trending,
    rangeBound,
    lateSessionOpportunity,
    lateSessionEvidence,
    summary,
    decisionNotes,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function buildWhyForExpiry(
  dayClass: ExpiryDayClass,
  schedule: ExpirySchedule,
  trending: boolean,
  rangeBound: boolean,
  compressing: boolean,
): string {
  const base = `${schedule.label}. Classified as ${dayClass} from session structure`;
  if (dayClass === "Expiry Compression") {
    return `${base}: ranges are contracting — directional calls need a confirmed expansion, not anticipation.`;
  }
  if (dayClass === "Trend Day") {
    return `${base}: path efficiency supports continuation-style trades aligned with structure.`;
  }
  if (dayClass === "Breakout Day") {
    return `${base}: price left the session balance with expanding realized vol — breakout/continuation logic preferred over fading.`;
  }
  if (dayClass === "Mean Reversion Day") {
    return `${base}: repeated mid-range crosses — fade extremes only with clear rejection, avoid chasing.`;
  }
  return `${base}: ${rangeBound ? "range-bound" : trending ? "mild trend" : "mixed"} ${
    compressing ? "with compression" : ""
  }. Prefer levels and confirmation over prediction.`;
}

function buildInvalidate(dayClass: ExpiryDayClass, brokeRange: boolean): string {
  if (dayClass === "Expiry Compression") {
    return "Invalid if a decisive range break prints with rising participation — compression thesis fails.";
  }
  if (dayClass === "Trend Day" || dayClass === "Breakout Day") {
    return brokeRange
      ? "Invalid if price re-enters the prior balance and holds (false break) or opposing BOS prints."
      : "Invalid if efficiency collapses back into a tight range with contracting realized vol.";
  }
  if (dayClass === "Mean Reversion Day") {
    return "Invalid if price accepts outside the session envelope without mean reversion (trend day transition).";
  }
  return "Invalid if a clean impulsive break of session high/low holds for multiple bars with expanding RV.";
}

/** Attach expiry-aware explanations to an AiDecision without changing BUY/SELL gates. */
export function enrichDecisionForExpiry(decision: AiDecision, intel: ExpiryIntelligence): AiDecision {
  if (!intel.active) return decision;

  const whyForExpiry = intel.decisionNotes.whyForExpiry;
  const premiumImpact = intel.decisionNotes.premiumImpact;
  const invalidate = intel.decisionNotes.invalidate;

  const kindNote =
    decision.direction === "wait"
      ? `WAIT on expiry is appropriate while ${intel.dayClass} lacks ${
          intel.compressing ? "a confirmed expansion" : "sufficient confluence"
        }.`
      : `${decision.kind} on expiry: aligned with ${intel.dayClass}${
          intel.lateSessionOpportunity ? " — late-session evidence present (structure/vol), not clock time." : "."
        }`;

  const late =
    intel.lateSessionOpportunity && intel.lateSessionEvidence.length
      ? ` Evidence for a stronger move: ${intel.lateSessionEvidence.join("; ")}.`
      : "";

  return {
    ...decision,
    explainability: {
      ...decision.explainability,
      whyDirection: `${decision.explainability.whyDirection} ${kindNote} ${whyForExpiry}${late}`,
      whyNow: `${decision.explainability.whyNow} Expiry context: ${intel.summary}.`,
      invalidation: `${decision.explainability.invalidation} Expiry invalidation: ${invalidate}`,
      improvements: [
        ...decision.explainability.improvements,
        ...(decision.direction === "wait"
          ? [
              intel.compressing ? "Need confirmed breakout of compression (not time-based)" : null,
              "Need clearer structure (BOS) before fighting theta as an options buyer",
            ].filter(Boolean) as string[]
          : []),
      ].slice(0, 10),
    },
    unlockConditions:
      decision.direction === "wait"
        ? [
            ...decision.unlockConditions,
            ...(intel.compressing ? ["Need compression breakout confirmation (structure + volume)"] : []),
            ...(intel.realizedVol === "contracting"
              ? ["Need realized-vol expansion before chasing premium as a buyer"]
              : []),
          ].slice(0, 10)
        : decision.unlockConditions,
    contributions: [
      { label: "Expiry", value: intel.schedule.label, tone: "warn" },
      { label: "Day class", value: intel.dayClass ?? "—", tone: "brand" },
      {
        label: "Premium decay",
        value:
          intel.premiumDecay === "hurts_buyer"
            ? "Hurts option buyer"
            : intel.premiumDecay === "helps_buyer"
              ? "Can help option buyer"
              : "Mixed",
        tone: intel.premiumDecay === "hurts_buyer" ? "bear" : intel.premiumDecay === "helps_buyer" ? "bull" : "neutral",
      },
      { label: "RV proxy", value: intel.realizedVol, tone: "info" },
      ...decision.contributions,
    ],
    reasoning: `${decision.reasoning} | Expiry: ${whyForExpiry} ${premiumImpact}`,
  };
}
