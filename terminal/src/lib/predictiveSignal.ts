import { num, titleCase, type Tone } from "./format";
import type { AiDecision } from "./decision";
import type { OrderBlock, Fvg, LiquiditySweep, StrategyMetadata, TradeSetup, Trend } from "./types";

/** Signal lifecycle states for predictive trade plans. */
export type SignalState =
  | "Watching"
  | "Setup Forming"
  | "Entry Ready"
  | "Active Trade"
  | "Partial Profit"
  | "Target Hit"
  | "Stop Hit"
  | "Expired";

export interface LevelExplanation {
  level: string;
  price: string;
  reason: string;
}

export interface PredictivePlan {
  setup: TradeSetup;
  direction: "buy" | "sell";
  label: string;
  state: SignalState;
  stateTone: Tone;
  confidence: number;
  entry: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  stopLow: number;
  stopHigh: number;
  target1: number;
  target2: number | null;
  target3: number | null;
  riskReward: number | null;
  strategyName: string;
  setupType: string;
  lastPrice: number;
  reasoning: string;
  evidenceScores: Record<string, number>;
  contributions: { label: string; value: string; tone?: Tone }[];
  hitFlags: {
    entry: boolean;
    stop: boolean;
    t1: boolean;
    t2: boolean;
    t3: boolean;
  };
  levelExplanations: LevelExplanation[];
  planValid: boolean;
  planValidationNote: string;
}

const STATE_TONE: Record<SignalState, Tone> = {
  Watching: "neutral",
  "Setup Forming": "info",
  "Entry Ready": "brand",
  "Active Trade": "bull",
  "Partial Profit": "bull",
  "Target Hit": "bull",
  "Stop Hit": "bear",
  Expired: "warn",
};

function mid(low: number, high: number): number {
  return (low + high) / 2;
}

function near(price: number, level: number, tolPct = 0.0015): boolean {
  if (level === 0) return false;
  return Math.abs(price - level) / Math.abs(level) <= tolPct;
}

function crossed(price: number, level: number, bullish: boolean, wantAbove: boolean): boolean {
  if (bullish) return wantAbove ? price >= level : price <= level;
  return wantAbove ? price <= level : price >= level;
}

function explainLevels(opts: {
  bullish: boolean;
  entry: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  t1: number;
  t2: number | null;
  t3: number | null;
  setup: TradeSetup;
  ob?: OrderBlock | null;
  fvg?: Fvg | null;
  sweep?: LiquiditySweep | null;
  trend?: Trend | null;
}): LevelExplanation[] {
  const { bullish, entry, entryLow, entryHigh, stop, t1, t2, t3, setup, ob, fvg, sweep, trend } = opts;
  const entryWhy = ob
    ? `Entry at ${ob.type} order block (${entryLow.toFixed(2)}–${entryHigh.toFixed(2)}) — institutional demand/supply zone with ${Math.round(ob.confidence)}% confidence.`
    : fvg
      ? `Entry inside ${fvg.type} fair value gap (${entryLow.toFixed(2)}–${entryHigh.toFixed(2)}) — price rebalancing inefficiency in trend direction.`
      : `Entry at ${setup.entry_zone.label} (${entryLow.toFixed(2)}–${entryHigh.toFixed(2)}) from ${setup.setup_type.replace(/_/g, " ")}.`;

  const stopWhy = ob
    ? `Stop below/above OB invalidation at ${stop.toFixed(2)} — a close beyond this level means the institutional zone failed.`
    : `Stop at ${stop.toFixed(2)} — structural invalidation beyond the setup zone (${(Math.abs(entry - stop) / Math.max(entry, 1)).toFixed(2)}% risk).`;

  const t1Why = sweep
    ? `Target 1 at ${t1.toFixed(2)} — first liquidity pool after confirmed ${sweep.type} sweep.`
    : trend
      ? `Target 1 at ${t1.toFixed(2)} — measured move aligned with ${trend.trend} structure.`
      : `Target 1 at ${t1.toFixed(2)} — primary objective from setup geometry.`;

  const out: LevelExplanation[] = [
    { level: "Entry", price: entry.toFixed(2), reason: entryWhy },
    { level: "Stop", price: stop.toFixed(2), reason: stopWhy },
    { level: "Target 1", price: t1.toFixed(2), reason: t1Why },
  ];

  if (t2 != null) {
    out.push({
      level: "Target 2",
      price: t2.toFixed(2),
      reason: `Target 2 at ${t2.toFixed(2)} — extended ${bullish ? "upside" : "downside"} objective (R:R ${setup.risk_reward?.toFixed(1) ?? "—"}).`,
    });
  }
  if (t3 != null) {
    out.push({
      level: "Target 3",
      price: t3.toFixed(2),
      reason: `Target 3 at ${t3.toFixed(2)} — runner target at next structural liquidity.`,
    });
  }
  return out;
}

function validatePlan(
  bullish: boolean,
  entry: number,
  stop: number,
  t1: number,
  rr: number | null,
): { valid: boolean; note: string } {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(t1 - entry);
  if (risk <= 0) return { valid: false, note: "Invalid plan: stop equals entry — no defined risk." };
  const computedRr = reward / risk;
  if (computedRr < 1.5) return { valid: false, note: `R:R ${computedRr.toFixed(2)} below 1.5 minimum — plan rejected.` };
  if (bullish && stop >= entry) return { valid: false, note: "Invalid long: stop must be below entry." };
  if (!bullish && stop <= entry) return { valid: false, note: "Invalid short: stop must be above entry." };
  if (rr != null && rr < 2.0) return { valid: false, note: `Declared R:R ${rr.toFixed(2)} below selective minimum (2.0).` };
  return { valid: true, note: `Plan validated: R:R ${computedRr.toFixed(2)}, geometry consistent with ${bullish ? "long" : "short"} bias.` };
}

/** Derive lifecycle + plan geometry from an active setup and last traded price. */
export function derivePredictivePlan(opts: {
  setup: TradeSetup;
  lastPrice: number;
  strategy?: StrategyMetadata | null;
  trend?: Trend | null;
  orderBlocks?: OrderBlock[];
  fvgs?: Fvg[];
  sweeps?: LiquiditySweep[];
  decision?: AiDecision | null;
}): PredictivePlan {
  const { setup, lastPrice, strategy, trend, orderBlocks = [], fvgs = [], sweeps = [], decision } = opts;
  const bullish = setup.direction.toLowerCase().includes("bull") || setup.direction.toLowerCase().includes("long");
  const direction: "buy" | "sell" = bullish ? "buy" : "sell";

  const entryLow = num(setup.entry_zone.low);
  const entryHigh = num(setup.entry_zone.high);
  const entry = mid(entryLow, entryHigh);
  const stopLow = num(setup.stop_loss_zone.low);
  const stopHigh = num(setup.stop_loss_zone.high);
  const stop = mid(stopLow, stopHigh);
  const t1 = setup.target_zones[0] ? mid(num(setup.target_zones[0].low), num(setup.target_zones[0].high)) : entry;
  const t2 = setup.target_zones[1]
    ? mid(num(setup.target_zones[1].low), num(setup.target_zones[1].high))
    : null;
  const t3 = setup.target_zones[2]
    ? mid(num(setup.target_zones[2].low), num(setup.target_zones[2].high))
    : null;

  const obType = bullish ? "bullish" : "bearish";
  const ob = orderBlocks.find((o) => o.type.toLowerCase().includes(obType)) ?? null;
  const fvg = fvgs.find((f) => f.type.toLowerCase().includes(obType)) ?? null;
  const sweep = sweeps.find((s) => s.type.toLowerCase().includes(obType)) ?? null;

  const entryHit =
    (lastPrice >= Math.min(entryLow, entryHigh) && lastPrice <= Math.max(entryLow, entryHigh)) ||
    crossed(lastPrice, entry, bullish, true);
  const stopHit = crossed(lastPrice, stop, bullish, false) || near(lastPrice, stop, 0.0008);
  const t1Hit = crossed(lastPrice, t1, bullish, true);
  const t2Hit = t2 != null && crossed(lastPrice, t2, bullish, true);
  const t3Hit = t3 != null && crossed(lastPrice, t3, bullish, true);

  let state: SignalState = "Entry Ready";
  if (setup.status.toLowerCase().includes("expir")) state = "Expired";
  else if (stopHit && entryHit) state = "Stop Hit";
  else if (stopHit && !entryHit) state = "Watching";
  else if (t3Hit || (t2Hit && !t3)) state = "Target Hit";
  else if (t1Hit && entryHit) state = t2Hit ? "Partial Profit" : "Partial Profit";
  else if (entryHit) state = "Active Trade";
  else if ((decision?.confidence ?? setup.confidence_score) >= 75) state = "Entry Ready";
  else if (setup.confidence_score >= 55) state = "Setup Forming";
  else state = "Watching";

  if (entryHit && stopHit && !t1Hit) state = "Stop Hit";
  if (t2Hit || t3Hit) state = "Target Hit";
  else if (t1Hit && entryHit && !stopHit) state = "Partial Profit";

  const label =
    state === "Active Trade"
      ? "ACTIVE TRADE"
      : state === "Stop Hit"
        ? "STOP HIT"
        : state === "Partial Profit"
          ? "TARGET 1 HIT"
          : state === "Target Hit"
            ? t3Hit
              ? "TARGET 3 HIT"
              : t2Hit
                ? "TARGET 2 HIT"
                : "TARGET HIT"
            : direction === "buy"
              ? "BUY SETUP"
              : "SELL SETUP";

  const strategyName = strategy?.strategy_name ?? "Structure Confluence";
  const levelExplanations = explainLevels({
    bullish,
    entry,
    entryLow,
    entryHigh,
    stop,
    t1,
    t2,
    t3,
    setup,
    ob,
    fvg,
    sweep,
    trend,
  });
  const validation = validatePlan(bullish, entry, stop, t1, setup.risk_reward);

  const contributions = [
    { label: "Plan validation", value: validation.valid ? "Passed" : "Failed", tone: validation.valid ? ("bull" as Tone) : ("warn" as Tone) },
    { label: "Signal state", value: state, tone: STATE_TONE[state] },
    { label: "Direction", value: direction.toUpperCase(), tone: direction === "buy" ? ("bull" as Tone) : ("bear" as Tone) },
    { label: "Institutional score", value: decision ? `${decision.institutional.score}` : "—" },
    { label: "Setup type", value: titleCase(setup.setup_type) },
    { label: "Strategy", value: strategyName },
    { label: "Market structure", value: trend ? titleCase(trend.trend) : "—" },
    { label: "Risk / Reward", value: setup.risk_reward != null ? num(setup.risk_reward).toFixed(2) : "—" },
    { label: "Last price", value: String(lastPrice) },
  ];

  const reasoning =
    `${validation.note} ` +
    levelExplanations.map((l) => `${l.level}: ${l.reason}`).join(" ") +
    (decision?.selfReview.passed ? " Self-review passed." : "");

  return {
    setup,
    direction,
    label,
    state,
    stateTone: STATE_TONE[state],
    confidence: decision?.confidence ?? setup.confidence_score,
    entry,
    entryLow,
    entryHigh,
    stop,
    stopLow,
    stopHigh,
    target1: t1,
    target2: t2,
    target3: t3,
    riskReward: setup.risk_reward,
    strategyName,
    setupType: titleCase(setup.setup_type),
    lastPrice,
    reasoning,
    evidenceScores: decision?.confidenceFactors ?? setup.evidence_scores ?? {},
    contributions,
    hitFlags: { entry: entryHit, stop: stopHit, t1: t1Hit, t2: !!t2Hit, t3: !!t3Hit },
    levelExplanations,
    planValid: validation.valid,
    planValidationNote: validation.note,
  };
}
