/**
 * TradeMind V8 — Market Personality Engine.
 *
 * Classifies the *context* of the tape before BUY / SELL / WAIT.
 * Updated every candle. Decisions should reason from personality,
 * not from isolated pattern checklists alone.
 */

import { num } from "./format";
import type { Candle, Levels, StructureEvents } from "./types";

export type MarketPersonalityId =
  | "strong_trend"
  | "weak_trend"
  | "trend_exhaustion"
  | "balanced_auction"
  | "range"
  | "compression"
  | "expansion"
  | "panic_selling"
  | "aggressive_buying"
  | "absorption"
  | "distribution"
  | "accumulation"
  | "stop_hunt"
  | "false_breakout"
  | "trend_continuation";

export type PersonalityBias = "bullish" | "bearish" | "neutral";

export interface MarketPersonality {
  id: MarketPersonalityId;
  /** Human label, e.g. "Bearish Trend Continuation" */
  label: string;
  bias: PersonalityBias;
  /** How strongly this personality is expressing (0–100). */
  strength: number;
  /** Confidence that the classification is correct (0–100). */
  confidence: number;
  characteristics: string[];
  /** Preferred discretionary action given this personality alone. */
  preferredAction: "buy" | "sell" | "wait";
  /** How much Early (B) entries are favored (−1..+1). */
  earlyBias: number;
  /** How much Confirmed (A) should wait for more structure (−1..+1 wait). */
  confirmPatience: number;
  /** Secondary / competing personalities ranked. */
  alternatives: Array<{ id: MarketPersonalityId; label: string; score: number }>;
  asOfCandle: string;
  updatedAt: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function labelOf(id: MarketPersonalityId, bias: PersonalityBias): string {
  const map: Record<MarketPersonalityId, string> = {
    strong_trend: bias === "bullish" ? "Strong Bullish Trend" : bias === "bearish" ? "Strong Bearish Trend" : "Strong Trend",
    weak_trend: bias === "bullish" ? "Weak Bullish Trend" : bias === "bearish" ? "Weak Bearish Trend" : "Weak Trend",
    trend_exhaustion: bias === "bullish" ? "Bullish Trend Exhaustion" : bias === "bearish" ? "Bearish Trend Exhaustion" : "Trend Exhaustion",
    balanced_auction: "Balanced Auction",
    range: "Range",
    compression: "Compression",
    expansion: bias === "bullish" ? "Bullish Expansion" : bias === "bearish" ? "Bearish Expansion" : "Expansion",
    panic_selling: "Panic Selling",
    aggressive_buying: "Aggressive Buying",
    absorption: bias === "bullish" ? "Bullish Absorption" : bias === "bearish" ? "Bearish Absorption" : "Absorption",
    distribution: "Distribution",
    accumulation: "Accumulation",
    stop_hunt: bias === "bullish" ? "Stop Hunt (Buy-side)" : bias === "bearish" ? "Stop Hunt (Sell-side)" : "Stop Hunt",
    false_breakout: bias === "bullish" ? "False Breakout Up" : bias === "bearish" ? "False Breakout Down" : "False Breakout",
    trend_continuation:
      bias === "bullish" ? "Bullish Trend Continuation" : bias === "bearish" ? "Bearish Trend Continuation" : "Trend Continuation",
  };
  return map[id];
}

function atr(candles: Candle[], lookback = 14): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-Math.min(lookback + 1, candles.length));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const h = num(slice[i].high);
    const l = num(slice[i].low);
    const pc = num(slice[i - 1].close);
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    n += 1;
  }
  return n ? sum / n : 0;
}

function pivotHighs(candles: Candle[], left = 2, right = 2): number[] {
  const out: number[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const h = num(candles[i].high);
    let ok = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && num(candles[j].high) >= h) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(h);
  }
  return out;
}

function pivotLows(candles: Candle[], left = 2, right = 2): number[] {
  const out: number[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const l = num(candles[i].low);
    let ok = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && num(candles[j].low) <= l) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(l);
  }
  return out;
}

interface Features {
  slopePct: number;
  atrNow: number;
  atrPrev: number;
  rangePct: number;
  volRatio: number;
  lowerHighs: number;
  higherLows: number;
  higherHighs: number;
  lowerLows: number;
  bodyBias: number; // −1 bear .. +1 bull over last N
  wickUpRatio: number;
  wickDownRatio: number;
  compression: number; // 0–1
  expansion: number; // 0–1
  failedSupport: boolean;
  failedResistance: boolean;
  stopHuntBuy: boolean;
  stopHuntSell: boolean;
  falseBreakUp: boolean;
  falseBreakDown: boolean;
  absorptionBull: boolean;
  absorptionBear: boolean;
}

function extractFeatures(candles: Candle[], levels?: Levels | null): Features | null {
  if (candles.length < 20) return null;
  const slice = candles.slice(-40);
  const aNow = atr(slice, 10);
  const aPrev = atr(slice.slice(0, -10), 10) || aNow;
  const first = num(slice[0].close);
  const last = num(slice[slice.length - 1].close);
  const slopePct = first > 0 ? ((last - first) / first) * 100 : 0;

  const highs = slice.map((c) => num(c.high));
  const lows = slice.map((c) => num(c.low));
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const rangePct = last > 0 ? ((hi - lo) / last) * 100 : 0;

  const vols = slice.map((c) => num(c.volume));
  const avgVol = vols.reduce((s, v) => s + v, 0) / vols.length;
  const recentVol = vols.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

  const ph = pivotHighs(slice);
  const pl = pivotLows(slice);
  let lowerHighs = 0;
  let higherHighs = 0;
  for (let i = 1; i < ph.length; i++) {
    if (ph[i] < ph[i - 1]) lowerHighs += 1;
    if (ph[i] > ph[i - 1]) higherHighs += 1;
  }
  let higherLows = 0;
  let lowerLows = 0;
  for (let i = 1; i < pl.length; i++) {
    if (pl[i] > pl[i - 1]) higherLows += 1;
    if (pl[i] < pl[i - 1]) lowerLows += 1;
  }

  const lastN = slice.slice(-8);
  let bodySum = 0;
  let wickUp = 0;
  let wickDn = 0;
  let ranges = 0;
  for (const c of lastN) {
    const o = num(c.open);
    const h = num(c.high);
    const l = num(c.low);
    const cl = num(c.close);
    const range = Math.max(h - l, 1e-9);
    bodySum += (cl - o) / range;
    wickUp += (h - Math.max(o, cl)) / range;
    wickDn += (Math.min(o, cl) - l) / range;
    ranges += range;
  }
  const bodyBias = clamp(bodySum / lastN.length, -1, 1);
  const wickUpRatio = wickUp / lastN.length;
  const wickDownRatio = wickDn / lastN.length;
  const avgRange = ranges / lastN.length;
  const compression = aPrev > 0 ? clamp(1 - aNow / aPrev, 0, 1) : 0;
  const expansion = aPrev > 0 ? clamp(aNow / aPrev - 1, 0, 1.5) / 1.5 : 0;

  const px = last;
  const support = levels?.support_levels?.slice().sort((a, b) => Math.abs(a.price - px) - Math.abs(b.price - px))[0];
  const resistance = levels?.resistance_levels
    ?.slice()
    .sort((a, b) => Math.abs(a.price - px) - Math.abs(b.price - px))[0];

  const c0 = slice[slice.length - 1];
  const c1 = slice[slice.length - 2];
  const failedSupport =
    !!support &&
    num(c1.low) < support.price &&
    num(c0.close) < support.price &&
    num(c0.high) >= support.price * 0.999;
  const failedResistance =
    !!resistance &&
    num(c1.high) > resistance.price &&
    num(c0.close) > resistance.price &&
    num(c0.low) <= resistance.price * 1.001;

  // Stop hunt: pierce swing then close back inside
  const recentLow = Math.min(...lows.slice(-12, -2));
  const recentHigh = Math.max(...highs.slice(-12, -2));
  const stopHuntBuy =
    num(c0.low) < recentLow && num(c0.close) > recentLow && wickDownRatio > 0.35 && volRatio > 1.2;
  const stopHuntSell =
    num(c0.high) > recentHigh && num(c0.close) < recentHigh && wickUpRatio > 0.35 && volRatio > 1.2;

  const falseBreakUp =
    num(c1.close) > recentHigh && num(c0.close) < recentHigh && wickUpRatio > 0.3;
  const falseBreakDown =
    num(c1.close) < recentLow && num(c0.close) > recentLow && wickDownRatio > 0.3;

  // Absorption: high volume, small body near extreme
  const lastRange = Math.max(num(c0.high) - num(c0.low), 1e-9);
  const lastBody = Math.abs(num(c0.close) - num(c0.open)) / lastRange;
  const absorptionBull = volRatio > 1.6 && lastBody < 0.35 && wickDownRatio > 0.4 && bodyBias >= -0.15;
  const absorptionBear = volRatio > 1.6 && lastBody < 0.35 && wickUpRatio > 0.4 && bodyBias <= 0.15;

  void avgRange;

  return {
    slopePct,
    atrNow: aNow,
    atrPrev: aPrev,
    rangePct,
    volRatio,
    lowerHighs,
    higherLows,
    higherHighs,
    lowerLows,
    bodyBias,
    wickUpRatio,
    wickDownRatio,
    compression,
    expansion,
    failedSupport,
    failedResistance,
    stopHuntBuy,
    stopHuntSell,
    falseBreakUp,
    falseBreakDown,
    absorptionBull,
    absorptionBear,
  };
}

type Candidate = {
  id: MarketPersonalityId;
  bias: PersonalityBias;
  score: number;
  chars: string[];
};

/**
 * Classify market personality from the latest candles (call every bar).
 */
export function classifyMarketPersonality(opts: {
  candles: Candle[];
  levels?: Levels | null;
  structureEvents?: StructureEvents | null;
}): MarketPersonality {
  const { candles, levels, structureEvents } = opts;
  const now = new Date().toISOString();
  const lastTs = candles.length ? candles[candles.length - 1].open_time : now;

  const f = extractFeatures(candles, levels);
  if (!f) {
    return {
      id: "balanced_auction",
      label: "Balanced Auction",
      bias: "neutral",
      strength: 20,
      confidence: 25,
      characteristics: ["Insufficient bars to classify personality"],
      preferredAction: "wait",
      earlyBias: -0.5,
      confirmPatience: 0.8,
      alternatives: [],
      asOfCandle: lastTs,
      updatedAt: now,
    };
  }

  const candidates: Candidate[] = [];

  // Panic / aggressive
  if (f.slopePct < -0.45 && f.volRatio > 1.7 && f.bodyBias < -0.35) {
    candidates.push({
      id: "panic_selling",
      bias: "bearish",
      score: clamp(70 + f.volRatio * 8 + Math.abs(f.slopePct) * 10, 0, 98),
      chars: ["Sharp downside displacement", "Volume surge", "Persistent bearish bodies"],
    });
  }
  if (f.slopePct > 0.45 && f.volRatio > 1.7 && f.bodyBias > 0.35) {
    candidates.push({
      id: "aggressive_buying",
      bias: "bullish",
      score: clamp(70 + f.volRatio * 8 + f.slopePct * 10, 0, 98),
      chars: ["Sharp upside displacement", "Volume surge", "Persistent bullish bodies"],
    });
  }

  // Compression / expansion
  if (f.compression > 0.35 && f.rangePct < 0.55) {
    candidates.push({
      id: "compression",
      bias: "neutral",
      score: clamp(55 + f.compression * 40, 0, 92),
      chars: ["ATR contracting", "Tight range", "Energy building — wait for expansion"],
    });
  }
  if (f.expansion > 0.35) {
    const bias: PersonalityBias = f.slopePct > 0.08 ? "bullish" : f.slopePct < -0.08 ? "bearish" : "neutral";
    candidates.push({
      id: "expansion",
      bias,
      score: clamp(55 + f.expansion * 45, 0, 95),
      chars: ["ATR expanding", "Range widening", bias === "neutral" ? "Direction unclear" : `${bias} displacement`],
    });
  }

  // Range / balanced
  if (Math.abs(f.slopePct) < 0.18 && f.rangePct < 0.7 && f.compression < 0.4) {
    candidates.push({
      id: "range",
      bias: "neutral",
      score: clamp(60 + (0.3 - Math.abs(f.slopePct)) * 80, 0, 90),
      chars: ["Flat slope", "Contained range", "Mean-reversion more likely than breakout chase"],
    });
    candidates.push({
      id: "balanced_auction",
      bias: "neutral",
      score: clamp(50 + (1 - Math.abs(f.bodyBias)) * 30, 0, 85),
      chars: ["Two-sided trade", "No durable initiative", "Auction seeking fair value"],
    });
  }

  // Strong / weak / continuation trend
  const bearStructure = f.lowerHighs >= 2 && f.slopePct < -0.12;
  const bullStructure = f.higherLows >= 2 && f.slopePct > 0.12;
  if (bearStructure || (f.slopePct < -0.25 && f.bodyBias < -0.2)) {
    const strong = Math.abs(f.slopePct) > 0.35 && f.volRatio > 1.15 && f.lowerHighs >= 2;
    candidates.push({
      id: strong ? "strong_trend" : "weak_trend",
      bias: "bearish",
      score: clamp(58 + Math.abs(f.slopePct) * 40 + f.lowerHighs * 6, 0, 96),
      chars: [
        ...(f.lowerHighs >= 2 ? ["Repeated lower highs"] : []),
        ...(f.lowerLows >= 1 ? ["Lower lows confirming"] : []),
        f.volRatio > 1.1 ? "Selling pressure supported by volume" : "Trend present but participation soft",
      ],
    });
    if (f.lowerHighs >= 2 && f.bodyBias < -0.15) {
      const chars = [
        "Repeated lower highs",
        "Weak pullbacks",
        "Expanding bearish momentum",
        ...(f.failedSupport ? ["Failed support retests"] : []),
        f.volRatio > 1.05 ? "Increasing selling pressure" : "Steady bearish control",
      ];
      candidates.push({
        id: "trend_continuation",
        bias: "bearish",
        score: clamp(62 + f.lowerHighs * 8 + Math.abs(f.bodyBias) * 25, 0, 97),
        chars,
      });
    }
  }
  if (bullStructure || (f.slopePct > 0.25 && f.bodyBias > 0.2)) {
    const strong = f.slopePct > 0.35 && f.volRatio > 1.15 && f.higherLows >= 2;
    candidates.push({
      id: strong ? "strong_trend" : "weak_trend",
      bias: "bullish",
      score: clamp(58 + f.slopePct * 40 + f.higherLows * 6, 0, 96),
      chars: [
        ...(f.higherLows >= 2 ? ["Repeated higher lows"] : []),
        ...(f.higherHighs >= 1 ? ["Higher highs confirming"] : []),
        f.volRatio > 1.1 ? "Buying pressure supported by volume" : "Trend present but participation soft",
      ],
    });
    if (f.higherLows >= 2 && f.bodyBias > 0.15) {
      candidates.push({
        id: "trend_continuation",
        bias: "bullish",
        score: clamp(62 + f.higherLows * 8 + f.bodyBias * 25, 0, 97),
        chars: [
          "Repeated higher lows",
          "Shallow pullbacks",
          "Expanding bullish momentum",
          ...(f.failedResistance ? ["Failed resistance retests"] : []),
          f.volRatio > 1.05 ? "Increasing buying pressure" : "Steady bullish control",
        ],
      });
    }
  }

  // Exhaustion
  if ((f.slopePct < -0.3 && f.wickDownRatio > 0.42 && f.volRatio > 1.4) || (f.slopePct > 0.3 && f.wickUpRatio > 0.42 && f.volRatio > 1.4)) {
    const bias: PersonalityBias = f.slopePct < 0 ? "bearish" : "bullish";
    candidates.push({
      id: "trend_exhaustion",
      bias,
      score: clamp(58 + f.volRatio * 10, 0, 90),
      chars: [
        "Climax volume",
        bias === "bearish" ? "Long lower wicks into selloff" : "Long upper wicks into rally",
        "Initiative may be exhausting — fade risk rising",
      ],
    });
  }

  // Accumulation / distribution
  if (Math.abs(f.slopePct) < 0.2 && f.volRatio > 1.25 && f.higherLows >= 1 && f.bodyBias >= 0) {
    candidates.push({
      id: "accumulation",
      bias: "bullish",
      score: clamp(55 + f.volRatio * 12, 0, 88),
      chars: ["Quiet upside absorption", "Higher lows in a base", "Possible mark-up ahead"],
    });
  }
  if (Math.abs(f.slopePct) < 0.2 && f.volRatio > 1.25 && f.lowerHighs >= 1 && f.bodyBias <= 0) {
    candidates.push({
      id: "distribution",
      bias: "bearish",
      score: clamp(55 + f.volRatio * 12, 0, 88),
      chars: ["Quiet downside supply", "Lower highs in a top", "Possible mark-down ahead"],
    });
  }

  // Absorption
  if (f.absorptionBull) {
    candidates.push({
      id: "absorption",
      bias: "bullish",
      score: clamp(60 + f.volRatio * 10, 0, 90),
      chars: ["High volume, small body", "Sellers absorbed near lows", "Potential reversal / continuation long"],
    });
  }
  if (f.absorptionBear) {
    candidates.push({
      id: "absorption",
      bias: "bearish",
      score: clamp(60 + f.volRatio * 10, 0, 90),
      chars: ["High volume, small body", "Buyers absorbed near highs", "Potential reversal / continuation short"],
    });
  }

  // Stop hunt / false breakout
  if (f.stopHuntBuy) {
    candidates.push({
      id: "stop_hunt",
      bias: "bullish",
      score: 78,
      chars: ["Liquidity sweep below swing", "Close back inside range", "Classic stop-hunt long context"],
    });
  }
  if (f.stopHuntSell) {
    candidates.push({
      id: "stop_hunt",
      bias: "bearish",
      score: 78,
      chars: ["Liquidity sweep above swing", "Close back inside range", "Classic stop-hunt short context"],
    });
  }
  if (f.falseBreakUp) {
    candidates.push({
      id: "false_breakout",
      bias: "bearish",
      score: 74,
      chars: ["Break above failed", "Trapped longs", "Mean-reversion short favored"],
    });
  }
  if (f.falseBreakDown) {
    candidates.push({
      id: "false_breakout",
      bias: "bullish",
      score: 74,
      chars: ["Break below failed", "Trapped shorts", "Mean-reversion long favored"],
    });
  }

  // Soft boost from recent BOS alignment
  const bos = structureEvents?.bos_events?.slice(-2) ?? [];
  if (bos.length) {
    const t = (bos[bos.length - 1].event_type ?? "").toLowerCase();
    const bearBos = /bear|down/.test(t);
    const bullBos = /bull|up/.test(t);
    for (const c of candidates) {
      if (bearBos && c.bias === "bearish") c.score = Math.min(99, c.score + 6);
      if (bullBos && c.bias === "bullish") c.score = Math.min(99, c.score + 6);
    }
  }

  if (!candidates.length) {
    candidates.push({
      id: "balanced_auction",
      bias: "neutral",
      score: 40,
      chars: ["No dominant personality — two-sided trade"],
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const strength = clamp(Math.round(top.score), 0, 100);
  // Confidence: separation from runner-up + feature stability
  const gap = candidates.length > 1 ? top.score - candidates[1].score : top.score * 0.3;
  const confidence = clamp(Math.round(45 + gap * 1.2 + Math.min(20, candles.length / 3)), 0, 96);

  const preferredAction: "buy" | "sell" | "wait" = (() => {
    if (top.id === "compression" || top.id === "balanced_auction" || top.id === "range") return "wait";
    if (top.id === "trend_exhaustion") return "wait";
    if (top.bias === "bearish") return "sell";
    if (top.bias === "bullish") return "buy";
    return "wait";
  })();

  // Early bias: continuation / strong trend / stop hunt favor early; exhaustion / compression favor patience
  let earlyBias = 0;
  if (["trend_continuation", "strong_trend", "stop_hunt", "false_breakout", "panic_selling", "aggressive_buying"].includes(top.id)) {
    earlyBias = 0.55;
  } else if (["weak_trend", "expansion", "distribution", "accumulation", "absorption"].includes(top.id)) {
    earlyBias = 0.25;
  } else if (["trend_exhaustion", "compression", "range", "balanced_auction"].includes(top.id)) {
    earlyBias = -0.45;
  }

  let confirmPatience = 0;
  if (["compression", "balanced_auction", "trend_exhaustion", "range"].includes(top.id)) confirmPatience = 0.7;
  else if (["weak_trend", "distribution", "accumulation"].includes(top.id)) confirmPatience = 0.35;
  else if (["trend_continuation", "strong_trend", "panic_selling", "aggressive_buying"].includes(top.id)) confirmPatience = -0.25;

  return {
    id: top.id,
    label: labelOf(top.id, top.bias),
    bias: top.bias,
    strength,
    confidence,
    characteristics: top.chars.slice(0, 6),
    preferredAction,
    earlyBias,
    confirmPatience,
    alternatives: candidates.slice(1, 4).map((c) => ({
      id: c.id,
      label: labelOf(c.id, c.bias),
      score: Math.round(c.score),
    })),
    asOfCandle: lastTs,
    updatedAt: now,
  };
}

/** Map personality → directional agreement with a setup side. */
export function personalityAgrees(p: MarketPersonality, side: "buy" | "sell"): boolean {
  if (p.preferredAction === "wait") return false;
  return p.preferredAction === side;
}

/** Soft multiplier for Early gates from personality (0.7–1.25). */
export function earlyGateMultiplier(p: MarketPersonality): number {
  return clamp(1 + p.earlyBias * 0.35, 0.7, 1.25);
}

/** Narrative for decision explainability. */
export function personalityNarrative(p: MarketPersonality): string {
  return `${p.label} (${p.strength}% strength · ${p.confidence}% conf) — ${p.characteristics.slice(0, 3).join("; ")}`;
}
