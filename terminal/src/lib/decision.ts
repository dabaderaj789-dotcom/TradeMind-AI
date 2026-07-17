import { confidenceLabel, directionTone, num, riskRating, titleCase, type Tone } from "./format";
import type {
  Candle,
  Fvg,
  LiquiditySweep,
  OrderBlock,
  StrategyMetadata,
  TradeSetup,
  Trend,
} from "./types";

export type DecisionKind = "STRONG BUY" | "BUY" | "WAIT" | "SELL" | "STRONG SELL";

/**
 * Selective institutional gates — fewer signals, higher quality.
 * A false BUY is much worse than WAIT. When uncertain → WAIT.
 */
const EVIDENCE_FLOOR = 68;
const MIN_EVIDENCE_HITS = 4;
const MIN_SETUP_CONFIDENCE = 78;
const STRONG_SETUP_CONFIDENCE = 88;
const STRONG_COMPOSITE = 90;
const MIN_RR = 2.2;
const MAX_RISK_PCT = 1.75; // reject trades that risk more than this % of entry
const MIN_OB_CONFIDENCE = 78;
const MIN_FVG_CONFIDENCE = 75;
const MIN_SWEEP_CONFIDENCE = 75;
const MIN_TREND_STRENGTH = 72;
const MIN_VOLUME_QUALITY = 68;
const MIN_INSTITUTIONAL_ACTION = 82;
const MIN_INSTITUTIONAL_STRONG = 90;
const MIN_MTF_AGREEMENT = 0.75; // need ≥3/4 TFs matching direction
const MIN_MARKET_HEALTH = 65;
const MIN_HISTORICAL_SIMILARITY = 75;
const MIN_SMC_CONFLUENCE = 2; // need ≥2 of OB / FVG / Sweep
/** At least one SMC factor must be OB or FVG (not sweep-only confluence). */
const REQUIRE_ZONE_SMC = true;

export const MTF_TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
export type MtfTimeframe = (typeof MTF_TIMEFRAMES)[number];

export interface QualityCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  critical: boolean;
}

export interface MtfTimeframeView {
  timeframe: MtfTimeframe;
  bias: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
}

export interface MtfAnalysis {
  timeframes: MtfTimeframeView[];
  agreement: number;
  aligned: boolean;
  /** 4H and 1D both agree with setup direction (non-neutral). */
  htfAligned: boolean;
  summary: string;
}

export interface MarketHealth {
  trend: string;
  volatility: string;
  liquidity: string;
  momentum: string;
  phase: string;
  score: number;
  tradeable: boolean;
}

export interface InstitutionalScore {
  score: number;
  grade: string;
  gradeTone: Tone;
}

export interface Explainability {
  whyDirection: string;
  whyNotOpposite: string;
  whyNow: string;
  invalidation: string;
  improvements: string[];
}

export interface SelfReview {
  passed: boolean;
  note: string;
}

/** Numeric signal quality card — every decision exposes these. */
export interface SignalQuality {
  tradeQualityScore: number;
  institutionalScore: number;
  confidence: number;
  expectedRiskPct: number | null;
  expectedRewardPct: number | null;
  riskReward: number | null;
  historicalSimilarity: number;
}

export interface AiDecision {
  kind: DecisionKind;
  tone: Tone;
  confidence: number;
  tradeQuality: string;
  tradeQualityTone: Tone;
  riskLabel: string;
  riskTone: Tone;
  setup: TradeSetup | null;
  setupType: string;
  strategyName: string;
  strategyId: string | null;
  direction: "buy" | "sell" | "wait";
  marketPhase: string;
  trendLabel: string;
  evidenceSummary: string[];
  evidenceScores: Record<string, number>;
  reasoning: string;
  timestamp: string;
  contributions: { label: string; value: string; tone?: Tone }[];
  actionable: boolean;
  qualityChecks: QualityCheck[];
  mtf: MtfAnalysis;
  marketHealth: MarketHealth;
  institutional: InstitutionalScore;
  explainability: Explainability;
  selfReview: SelfReview;
  confidenceFactors: Record<string, number>;
  signalQuality: SignalQuality;
  /** Developer diagnostics — which critical rules blocked BUY/SELL. */
  rejectionReasons: string[];
  /** What must become true before a directional call is valid. */
  unlockConditions: string[];
}

export interface ChartAnnotation {
  time: string;
  side: "buy" | "sell" | "wait";
  label: string;
  confidence: number;
  setupType: string;
  strategy: string;
  timestamp: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function evidenceTop(scores: Record<string, number>, n = 4): string[] {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${titleCase(k)} ${Math.round(v)}%`);
}

function evidenceHits(scores: Record<string, number>): number {
  return Object.values(scores).filter((v) => Number.isFinite(v) && v >= EVIDENCE_FLOOR).length;
}

function strategyAligned(setup: TradeSetup, strategy: StrategyMetadata | null | undefined): boolean {
  if (!strategy) return false;
  return strategy.required_setup_types.includes(setup.setup_type);
}

function trendBiasLabel(trend: Trend | null | undefined): "Bullish" | "Bearish" | "Neutral" {
  if (!trend) return "Neutral";
  const t = directionTone(trend.trend);
  // Stricter: weak trends count as Neutral, not directional bias
  if (t === "bull") return trend.confidence >= MIN_TREND_STRENGTH ? "Bullish" : "Neutral";
  if (t === "bear") return trend.confidence >= MIN_TREND_STRENGTH ? "Bearish" : "Neutral";
  return "Neutral";
}

function buildMtfAnalysis(
  trends: Partial<Record<MtfTimeframe, Trend | null | undefined>>,
  setupDir: "bull" | "bear" | "neutral",
): MtfAnalysis {
  const timeframes: MtfTimeframeView[] = MTF_TIMEFRAMES.map((tf) => {
    const t = trends[tf];
    return {
      timeframe: tf,
      bias: trendBiasLabel(t),
      confidence: t?.confidence ?? 0,
    };
  });

  const empty: MtfAnalysis = {
    timeframes,
    agreement: 0,
    aligned: false,
    htfAligned: false,
    summary: "No clear multi-timeframe bias",
  };

  const nonNeutral = timeframes.filter((t) => t.bias !== "Neutral");
  if (!nonNeutral.length) return empty;

  const targetBias = setupDir === "bull" ? "Bullish" : setupDir === "bear" ? "Bearish" : null;
  if (!targetBias) return { ...empty, summary: "No directional setup for MTF check" };

  const agreeing = timeframes.filter((t) => t.bias === targetBias).length;
  const conflicting = timeframes.filter((t) => t.bias !== "Neutral" && t.bias !== targetBias).length;
  // Neutrals never count as confirmation
  const agreement = agreeing / MTF_TIMEFRAMES.length;

  const htf4h = timeframes.find((t) => t.timeframe === "4h");
  const htf1d = timeframes.find((t) => t.timeframe === "1d");
  const htfAligned =
    !!htf4h &&
    !!htf1d &&
    htf4h.bias === targetBias &&
    htf1d.bias === targetBias &&
    htf4h.confidence >= MIN_TREND_STRENGTH &&
    htf1d.confidence >= MIN_TREND_STRENGTH;

  const aligned = conflicting === 0 && agreement >= MIN_MTF_AGREEMENT && htfAligned;

  const parts = timeframes.map((t) => `${t.timeframe}=${t.bias}`).join(", ");
  const summary = aligned
    ? `MTF + HTF aligned (${parts})`
    : conflicting > 0
      ? `MTF conflict (${parts}) — standing aside`
      : !htfAligned
        ? `HTF not confirmed (4H=${htf4h?.bias ?? "—"}, 1D=${htf1d?.bias ?? "—"}) — need both with setup`
        : `MTF partial (${parts}) — need ≥${Math.ceil(MIN_MTF_AGREEMENT * 4)}/4 matching`;

  return { timeframes, agreement, aligned, htfAligned, summary };
}

function volumeQuality(candles: Candle[]): number {
  if (candles.length < 20) return 40;
  const recent = candles.slice(-20);
  const avg = recent.reduce((s, c) => s + num(c.volume), 0) / recent.length;
  const last = num(recent[recent.length - 1].volume);
  if (avg <= 0) return 45;
  const ratio = last / avg;
  if (ratio >= 1.5) return 90;
  if (ratio >= 1.25) return 80;
  if (ratio >= 1.05) return 68;
  if (ratio >= 0.85) return 55;
  return 28;
}

function volatilityScore(candles: Candle[]): { label: string; score: number } {
  if (candles.length < 14) return { label: "Unknown", score: 45 };
  const recent = candles.slice(-14);
  const ranges = recent.map((c) => (num(c.high) - num(c.low)) / Math.max(num(c.close), 1e-9));
  const avg = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  const pct = avg * 100;
  // Prefer moderate volatility — extremes hurt reliability
  if (pct > 4.0) return { label: "Extreme", score: 28 };
  if (pct > 2.8) return { label: "Elevated", score: 48 };
  if (pct > 1.2) return { label: "Healthy", score: 82 };
  if (pct > 0.55) return { label: "Normal", score: 78 };
  return { label: "Compressed", score: 50 };
}

function momentumScore(candles: Candle[]): { label: string; score: number; dir: "up" | "down" | "flat" } {
  if (candles.length < 10) return { label: "Flat", score: 45, dir: "flat" };
  const first = num(candles[candles.length - 10].close);
  const last = num(candles[candles.length - 1].close);
  const chg = ((last - first) / Math.max(first, 1e-9)) * 100;
  if (chg > 1.5) return { label: "Strong up", score: 88, dir: "up" };
  if (chg > 0.4) return { label: "Mild up", score: 72, dir: "up" };
  if (chg < -1.5) return { label: "Strong down", score: 88, dir: "down" };
  if (chg < -0.4) return { label: "Mild down", score: 72, dir: "down" };
  return { label: "Flat", score: 42, dir: "flat" };
}

function liquidityLabel(candles: Candle[]): { label: string; score: number } {
  const vq = volumeQuality(candles);
  if (vq >= 78) return { label: "Healthy", score: vq };
  if (vq >= MIN_VOLUME_QUALITY) return { label: "Adequate", score: vq };
  return { label: "Thin", score: vq };
}

function buildMarketHealth(
  trend: Trend | null | undefined,
  candles: Candle[],
  strategy: StrategyMetadata | null | undefined,
): MarketHealth {
  const vol = volatilityScore(candles);
  const liq = liquidityLabel(candles);
  const mom = momentumScore(candles);
  const phase = trend ? titleCase(trend.market_phase) : "Unknown";
  const trendLabel = trend ? titleCase(trend.trend) : "Unknown";

  const phaseLower = phase.toLowerCase();
  const ranging =
    phaseLower.includes("rang") || phaseLower.includes("accum") || phaseLower.includes("distrib");
  const strategySupportsRange =
    (strategy?.required_setup_types.some((t) => t.includes("range") || t.includes("breakout")) ??
      false);

  const score = Math.round(
    (trend?.confidence ?? 35) * 0.3 +
      vol.score * 0.18 +
      liq.score * 0.22 +
      mom.score * 0.18 +
      (trend?.phase_confidence ?? 35) * 0.12,
  );

  const tradeable =
    score >= MIN_MARKET_HEALTH &&
    liq.score >= MIN_VOLUME_QUALITY &&
    vol.score >= 45 &&
    (!ranging || strategySupportsRange);

  return {
    trend: trendLabel,
    volatility: vol.label,
    liquidity: liq.label,
    momentum: mom.label,
    phase,
    score,
    tradeable,
  };
}

function bestOb(orderBlocks: OrderBlock[], bullish: boolean): OrderBlock | null {
  const type = bullish ? "bullish" : "bearish";
  return (
    orderBlocks
      .filter(
        (o) =>
          o.type.toLowerCase().includes(type) &&
          o.confidence >= MIN_OB_CONFIDENCE &&
          !o.mitigation_state.toLowerCase().includes("fully") &&
          !o.mitigation_state.toLowerCase().includes("invalid"),
      )
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null
  );
}

function bestFvg(fvgs: Fvg[], bullish: boolean): Fvg | null {
  const type = bullish ? "bullish" : "bearish";
  return (
    fvgs
      .filter(
        (f) =>
          f.type.toLowerCase().includes(type) &&
          f.confidence >= MIN_FVG_CONFIDENCE &&
          f.fill_percentage < 60, // mostly open — filled gaps are weak
      )
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null
  );
}

function bestSweep(sweeps: LiquiditySweep[], bullish: boolean): LiquiditySweep | null {
  const type = bullish ? "bullish" : "bearish";
  return (
    sweeps
      .filter(
        (s) =>
          s.type.toLowerCase().includes(type) &&
          s.confidence >= MIN_SWEEP_CONFIDENCE &&
          (s.status.toLowerCase().includes("confirm") || s.confirmed_at),
      )
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null
  );
}

/** Weighted geometric mean — weak factors drag confidence hard. */
function compositeConfidence(factors: Record<string, number>): number {
  const weights: Record<string, number> = {
    historical_similarity: 0.12,
    structure_quality: 0.15,
    trend_strength: 0.14,
    smc_quality: 0.16,
    volume_quality: 0.12,
    volatility_fit: 0.08,
    mtf_agreement: 0.15,
    strategy_quality: 0.08,
  };
  let logSum = 0;
  let wSum = 0;
  for (const [key, w] of Object.entries(weights)) {
    const v = clamp(factors[key] ?? 0, 1, 100) / 100;
    logSum += w * Math.log(v);
    wSum += w;
  }
  return Math.round(Math.exp(logSum / wSum) * 100);
}

function institutionalGrade(score: number): InstitutionalScore {
  if (score >= 90) return { score, grade: "Institutional Grade", gradeTone: "bull" };
  if (score >= 80) return { score, grade: "High Quality", gradeTone: "brand" };
  if (score >= 70) return { score, grade: "Watchlist only", gradeTone: "info" };
  return { score, grade: "Avoid", gradeTone: "warn" };
}

function computeInstitutionalScore(
  checks: QualityCheck[],
  confidence: number,
  marketHealth: MarketHealth,
  mtf: MtfAnalysis,
): InstitutionalScore {
  const critical = checks.filter((c) => c.critical);
  const passRate = critical.length ? critical.filter((c) => c.passed).length / critical.length : 0;
  const raw = Math.round(
    confidence * 0.38 +
      passRate * 100 * 0.3 +
      marketHealth.score * 0.16 +
      mtf.agreement * 100 * 0.1 +
      (mtf.htfAligned ? 6 : 0),
  );
  return institutionalGrade(clamp(raw, 0, 100));
}

/**
 * Final gate: "If this were my own money, would I take this trade?"
 * Any hesitation → WAIT.
 */
function runSelfReview(opts: {
  checks: QualityCheck[];
  institutional: InstitutionalScore;
  mtf: MtfAnalysis;
  marketHealth: MarketHealth;
  preliminaryActionable: boolean;
  compositeConf: number;
  historicalSimilarity: number;
  smcCount: number;
  rrOk: boolean;
}): SelfReview {
  const {
    checks,
    institutional,
    mtf,
    marketHealth,
    preliminaryActionable,
    compositeConf,
    historicalSimilarity,
    smcCount,
    rrOk,
  } = opts;

  const criticalFails = checks.filter((c) => c.critical && !c.passed);
  const gradeOk =
    institutional.grade === "Institutional Grade" ||
    (institutional.grade === "High Quality" && institutional.score >= MIN_INSTITUTIONAL_ACTION);

  const wouldTakeWithOwnMoney =
    preliminaryActionable &&
    criticalFails.length === 0 &&
    institutional.score >= MIN_INSTITUTIONAL_ACTION &&
    gradeOk &&
    mtf.aligned &&
    mtf.htfAligned &&
    marketHealth.tradeable &&
    compositeConf >= MIN_SETUP_CONFIDENCE &&
    historicalSimilarity >= MIN_HISTORICAL_SIMILARITY &&
    smcCount >= MIN_SMC_CONFLUENCE &&
    rrOk;

  if (wouldTakeWithOwnMoney) {
    return {
      passed: true,
      note: "Self-review passed: I would take this with my own capital — structure, HTF, SMC, R:R, and institutional score all clear.",
    };
  }

  const reasons: string[] = [];
  if (criticalFails.length) reasons.push(criticalFails.map((c) => c.label).join(", "));
  if (!mtf.htfAligned) reasons.push("4H/1D not aligned");
  if (!mtf.aligned) reasons.push("MTF incomplete");
  if (!marketHealth.tradeable) reasons.push("market health");
  if (institutional.score < MIN_INSTITUTIONAL_ACTION)
    reasons.push(`institutional ${institutional.score}<${MIN_INSTITUTIONAL_ACTION}`);
  if (!gradeOk) reasons.push(`grade ${institutional.grade} (need High Quality @≥${MIN_INSTITUTIONAL_ACTION} or Institutional)`);
  if (historicalSimilarity < MIN_HISTORICAL_SIMILARITY) reasons.push("historical similarity");
  if (smcCount < MIN_SMC_CONFLUENCE) reasons.push(`SMC confluence ${smcCount}/${MIN_SMC_CONFLUENCE}`);
  if (!rrOk) reasons.push(`R:R < ${MIN_RR}`);
  if (compositeConf < MIN_SETUP_CONFIDENCE) reasons.push("composite confidence");

  return {
    passed: false,
    note: `Self-review failed — would not risk own capital. Blockers: ${reasons.join("; ") || "insufficient edge"}. Prefer WAIT.`,
  };
}

function expectedRiskReward(setup: TradeSetup | null, bullish: boolean): {
  riskPct: number | null;
  rewardPct: number | null;
  rr: number | null;
} {
  if (!setup) return { riskPct: null, rewardPct: null, rr: null };
  const entry = (num(setup.entry_zone.low) + num(setup.entry_zone.high)) / 2;
  if (entry <= 0) return { riskPct: null, rewardPct: null, rr: setup.risk_reward };
  const stop = bullish ? num(setup.stop_loss_zone.low) : num(setup.stop_loss_zone.high);
  const t1 = setup.target_zones[0]
    ? bullish
      ? num(setup.target_zones[0].high)
      : num(setup.target_zones[0].low)
    : null;
  const riskPct = stop > 0 ? (Math.abs(entry - stop) / entry) * 100 : null;
  const rewardPct = t1 != null ? (Math.abs(t1 - entry) / entry) * 100 : null;
  const rr =
    setup.risk_reward != null
      ? num(setup.risk_reward)
      : riskPct && rewardPct && riskPct > 0
        ? rewardPct / riskPct
        : null;
  return { riskPct, rewardPct, rr };
}

function phaseSupportsSetup(
  trend: Trend | null | undefined,
  setup: TradeSetup | null,
  strategy: StrategyMetadata | null | undefined,
): { ok: boolean; detail: string } {
  if (!setup || !trend) return { ok: false, detail: "Phase unknown without trend + setup" };
  const phase = trend.market_phase.toLowerCase();
  const ranging = phase.includes("rang") || phase.includes("accum") || phase.includes("distrib");
  const trending = phase.includes("trend") || phase.includes("impuls") || phase.includes("expans");
  const rangeSetup =
    setup.setup_type.includes("range") ||
    (strategy?.required_setup_types.some((t) => t.includes("range")) ?? false);

  if (ranging && !rangeSetup) {
    return { ok: false, detail: `Phase ${titleCase(trend.market_phase)} — avoid trend setups in range` };
  }
  if (trending || !ranging) {
    return { ok: true, detail: `Phase ${titleCase(trend.market_phase)} supports directional trade` };
  }
  if (ranging && rangeSetup) {
    return { ok: true, detail: `Range phase matches range/breakout strategy` };
  }
  return { ok: false, detail: `Phase ${titleCase(trend.market_phase)} does not support this setup` };
}

function momentumAgrees(
  candles: Candle[],
  bullish: boolean,
): { ok: boolean; detail: string } {
  const mom = momentumScore(candles);
  if (mom.dir === "flat") {
    return { ok: false, detail: "Momentum flat — no follow-through edge" };
  }
  if (bullish && mom.dir === "down") {
    return { ok: false, detail: `${mom.label} conflicts with BUY` };
  }
  if (!bullish && mom.dir === "up") {
    return { ok: false, detail: `${mom.label} conflicts with SELL` };
  }
  return { ok: true, detail: `${mom.label} supports direction` };
}

function buildExplainability(
  kind: DecisionKind,
  setup: TradeSetup | null,
  trend: Trend | null | undefined,
  checks: QualityCheck[],
  institutional: InstitutionalScore,
  marketHealth: MarketHealth,
  unlockConditions: string[],
): Explainability {
  const bullish = kind.includes("BUY");
  const bearish = kind.includes("SELL");
  const actionable = bullish || bearish;
  const failed = checks.filter((c) => !c.passed && c.critical);

  return {
    whyDirection: actionable
      ? `${kind} because ${setup?.setup_type.replace(/_/g, " ") ?? "setup"} aligns with ${trend?.trend ?? "structure"}, clears ${checks.filter((c) => c.passed).length}/${checks.length} gates, HTF confirms, institutional score ${institutional.score}.`
      : `WAIT — no statistical edge. Failed: ${failed.map((c) => c.label).join(", ") || "self-review / confluence"}.`,
    whyNotOpposite: actionable
      ? bullish
        ? "SELL rejected: bullish structure, demand-side SMC, and higher timeframes oppose shorts."
        : "BUY rejected: bearish structure, supply-side SMC, and higher timeframes oppose longs."
      : "Neither BUY nor SELL clears the full institutional checklist — WAIT preserves capital.",
    whyNow: actionable
      ? `Timing OK: ${setup?.signal_state?.replace(/_/g, " ") ?? "entry"} · ${institutional.grade} · phase ${marketHealth.phase} · ${marketHealth.momentum}.`
      : unlockConditions.length
        ? `Not now. Before BUY/SELL becomes valid: ${unlockConditions.slice(0, 4).join("; ")}.`
        : "Not now — standing aside until confluence returns.",
    invalidation: setup
      ? `Invalid if price ${bullish ? "closes below" : bearish ? "closes above" : "violates"} stop ${num(setup.stop_loss_zone.low).toFixed(2)}–${num(setup.stop_loss_zone.high).toFixed(2)}, or 4H/1D structure flips.`
      : "No active plan until a qualifying setup clears every gate.",
    improvements: unlockConditions.slice(0, 6),
  };
}

/**
 * Decision engine — WAIT by default.
 * BUY/SELL only when structure, HTF, SMC confluence, volume, R:R,
 * strategy, historical similarity, and self-review all pass.
 */
export function deriveDecision(opts: {
  trend: Trend | null | undefined;
  setup: TradeSetup | null | undefined;
  strategy: StrategyMetadata | null | undefined;
  orderBlocks?: OrderBlock[];
  fvgs?: Fvg[];
  sweeps?: LiquiditySweep[];
  candles?: Candle[];
  mtfTrends?: Partial<Record<MtfTimeframe, Trend | null | undefined>>;
  asOfFallback?: string;
}): AiDecision {
  const {
    trend,
    setup,
    strategy,
    orderBlocks = [],
    fvgs = [],
    sweeps = [],
    candles = [],
    mtfTrends = {},
  } = opts;

  const evidenceScores = setup?.evidence_scores ?? {
    market_structure: trend?.confidence ?? 0,
    trend_strength: trend?.confidence ?? 0,
    phase_confidence: trend?.phase_confidence ?? 0,
  };
  const topEvidence = evidenceTop(evidenceScores);
  const timestamp =
    setup?.detected_at ?? trend?.as_of ?? opts.asOfFallback ?? new Date().toISOString();
  const strategyName = strategy?.strategy_name ?? "No strategy match";
  const setupType = setup ? titleCase(setup.setup_type) : "No active setup";
  const phase = trend ? titleCase(trend.market_phase) : "—";
  const setupConf = setup?.confidence_score ?? 0;
  const toneDir = directionTone(setup?.direction ?? trend?.trend);
  const quality = confidenceLabel(setupConf || trend?.confidence || 0);
  const risk = riskRating(setup?.risk_reward);

  const tLabel = trend
    ? (() => {
        const t = directionTone(trend.trend);
        if (t === "neutral") return "Neutral";
        const strong = trend.confidence >= MIN_TREND_STRENGTH;
        return t === "bull"
          ? strong
            ? "Strong Bullish"
            : "Weak Bullish"
          : strong
            ? "Strong Bearish"
            : "Weak Bearish";
      })()
    : "—";

  const bullish = toneDir === "bull";
  const bearish = toneDir === "bear";
  const directional = bullish !== bearish && !!setup;

  const ob = directional ? bestOb(orderBlocks, bullish) : null;
  const fvg = directional ? bestFvg(fvgs, bullish) : null;
  const sweep = directional ? bestSweep(sweeps, bullish) : null;
  const smcCount = [ob, fvg, sweep].filter(Boolean).length;

  const hits = evidenceHits(evidenceScores);
  const { riskPct, rewardPct, rr } = expectedRiskReward(setup ?? null, bullish);
  const rrValue = rr ?? (setup?.risk_reward != null ? num(setup.risk_reward) : null);
  const rrOk = rrValue != null && rrValue >= MIN_RR;
  const riskSizeOk = riskPct == null || riskPct <= MAX_RISK_PCT;

  const mtf = buildMtfAnalysis(mtfTrends, toneDir);
  const marketHealth = buildMarketHealth(trend, candles, strategy);

  const aligned = setup ? strategyAligned(setup, strategy) : false;
  const trendStrengthOk = !!trend && trend.confidence >= MIN_TREND_STRENGTH;
  const trendAgrees =
    !!setup &&
    !!trend &&
    trendStrengthOk &&
    ((bullish && directionTone(trend.trend) === "bull") ||
      (bearish && directionTone(trend.trend) === "bear"));

  const structureAgrees =
    !!setup &&
    (evidenceScores.market_structure ?? trend?.confidence ?? 0) >= EVIDENCE_FLOOR &&
    trendAgrees;

  // Setup-type SMC: must have matching zone when setup claims it; always need confluence count
  const needsOb = !!setup?.setup_type.includes("order_block");
  const needsFvg = !!setup?.setup_type.includes("fvg");
  const needsSweep = !!setup?.setup_type.includes("liquidity");
  const obOk = !needsOb || !!ob;
  const fvgOk = !needsFvg || !!fvg;
  const sweepOk = !needsSweep || !!sweep;
  const smcConfluenceOk = !setup || smcCount >= MIN_SMC_CONFLUENCE;
  const zoneSmcOk = !REQUIRE_ZONE_SMC || !setup || !!ob || !!fvg;

  const signalFresh =
    !setup ||
    !setup.signal_state ||
    !/expir|invalid|cancel|fail|mitigat/i.test(setup.signal_state);

  const chartTfBias = mtf.timeframes.find((t) => t.timeframe === "1h");
  const expected1h = bullish ? "Bullish" : bearish ? "Bearish" : "Neutral";
  const chartTfOk = !setup || (!!chartTfBias && chartTfBias.bias === expected1h);

  const volQ = volumeQuality(candles);
  const volumeOk = !setup || volQ >= MIN_VOLUME_QUALITY;
  const volFit = volatilityScore(candles);
  const momCheck = momentumAgrees(candles, bullish);
  const phaseCheck = phaseSupportsSetup(trend, setup ?? null, strategy);

  // Historical similarity: engine confidence as proxy for "looks like past winners"
  const historicalSimilarity = clamp(
    setupConf * 0.9 + (aligned ? 8 : 0) + (hits >= MIN_EVIDENCE_HITS ? 5 : 0),
    0,
    100,
  );
  const historicalOk = historicalSimilarity >= MIN_HISTORICAL_SIMILARITY;

  const qualityChecks: QualityCheck[] = [
    {
      id: "structure",
      label: "Market structure",
      passed: structureAgrees,
      detail: structureAgrees
        ? `${tLabel} structure supports the setup`
        : "Structure bias does not confirm trade direction",
      critical: true,
    },
    {
      id: "htf_bias",
      label: "Higher timeframe bias",
      passed: mtf.htfAligned,
      detail: mtf.htfAligned
        ? "4H and 1D both agree with setup direction"
        : mtf.summary,
      critical: true,
    },
    {
      id: "chart_tf",
      label: "1H bias confirmation",
      passed: chartTfOk,
      detail: chartTfOk
        ? `1H bias ${chartTfBias?.bias ?? expected1h} agrees with setup`
        : `1H bias ${chartTfBias?.bias ?? "missing"} ≠ ${expected1h}`,
      critical: true,
    },
    {
      id: "trend_strength",
      label: "Trend strength",
      passed: trendAgrees && trendStrengthOk,
      detail: trendStrengthOk
        ? trendAgrees
          ? `Trend confidence ${Math.round(trend!.confidence)}% ≥ ${MIN_TREND_STRENGTH}%`
          : "Trend direction conflicts with setup"
        : `Trend too weak (${Math.round(trend?.confidence ?? 0)}% < ${MIN_TREND_STRENGTH}%)`,
      critical: true,
    },
    {
      id: "signal_fresh",
      label: "Signal freshness",
      passed: signalFresh,
      detail: signalFresh
        ? setup?.signal_state
          ? `Signal state: ${setup.signal_state.replace(/_/g, " ")}`
          : "No expiry / invalidation flags"
        : `Stale or invalidated signal (${setup?.signal_state ?? "unknown"})`,
      critical: true,
    },
    {
      id: "order_block",
      label: "Order block quality",
      passed: obOk && (!needsOb || !!ob),
      detail: ob
        ? `Valid ${ob.type} OB · ${ob.confidence}% · ${ob.mitigation_state}`
        : needsOb
          ? `No unmitigated OB ≥ ${MIN_OB_CONFIDENCE}%`
          : "OB not required for this setup type",
      critical: needsOb,
    },
    {
      id: "fvg",
      label: "Fair value gap quality",
      passed: fvgOk && (!needsFvg || !!fvg),
      detail: fvg
        ? `Valid ${fvg.type} FVG · ${fvg.confidence}% · ${fvg.fill_percentage}% filled`
        : needsFvg
          ? `No open FVG ≥ ${MIN_FVG_CONFIDENCE}% (<60% filled)`
          : "FVG not required for this setup type",
      critical: needsFvg,
    },
    {
      id: "sweep",
      label: "Liquidity sweep confirmation",
      passed: sweepOk,
      detail: sweep
        ? `Confirmed ${sweep.type} sweep · ${sweep.confidence}%`
        : needsSweep
          ? "Liquidity sweep not confirmed"
          : "Sweep optional for this setup type",
      critical: needsSweep,
    },
    {
      id: "smc_confluence",
      label: "SMC confluence",
      passed: smcConfluenceOk,
      detail: smcConfluenceOk
        ? `${smcCount} of OB/FVG/Sweep qualify (≥${MIN_SMC_CONFLUENCE} required)`
        : `Only ${smcCount} SMC factor(s) — need ≥${MIN_SMC_CONFLUENCE}`,
      critical: true,
    },
    {
      id: "zone_smc",
      label: "Zone SMC (OB or FVG)",
      passed: zoneSmcOk,
      detail: zoneSmcOk
        ? ob
          ? "Order block present"
          : fvg
            ? "Fair value gap present"
            : "No setup — zone check N/A"
        : "Sweep-only confluence rejected — need OB and/or FVG zone",
      critical: true,
    },
    {
      id: "volume",
      label: "Volume confirmation",
      passed: volumeOk,
      detail: volumeOk
        ? `Volume quality ${volQ}%`
        : `Thin participation (${volQ}% < ${MIN_VOLUME_QUALITY}%)`,
      critical: true,
    },
    {
      id: "volatility",
      label: "Volatility",
      passed: !setup || volFit.score >= 45,
      detail: `${volFit.label} (${volFit.score})`,
      critical: true,
    },
    {
      id: "phase",
      label: "Market phase",
      passed: !setup || phaseCheck.ok,
      detail: phaseCheck.detail,
      critical: true,
    },
    {
      id: "momentum",
      label: "Momentum alignment",
      passed: !setup || momCheck.ok,
      detail: momCheck.detail,
      critical: true,
    },
    {
      id: "rr",
      label: "Risk / reward",
      passed: rrOk,
      detail: rrOk
        ? `R:R ${rrValue!.toFixed(2)} ≥ ${MIN_RR}`
        : `R:R ${rrValue != null ? rrValue.toFixed(2) : "—"} below ${MIN_RR} minimum`,
      critical: true,
    },
    {
      id: "risk_size",
      label: "Expected risk size",
      passed: !setup || riskSizeOk,
      detail: riskSizeOk
        ? riskPct != null
          ? `Risk ${riskPct.toFixed(2)}% ≤ ${MAX_RISK_PCT}%`
          : "Risk size not computable — deferred to R:R gate"
        : `Risk ${riskPct!.toFixed(2)}% exceeds ${MAX_RISK_PCT}% max — WAIT`,
      critical: true,
    },
    {
      id: "strategy",
      label: "Strategy agreement",
      passed: aligned,
      detail: aligned ? `${strategyName} accepts this setup type` : "No matching strategy rule set",
      critical: true,
    },
    {
      id: "mtf",
      label: "Multi-timeframe",
      passed: mtf.aligned,
      detail: mtf.summary,
      critical: true,
    },
    {
      id: "confidence",
      label: "Setup confidence",
      passed: setupConf >= MIN_SETUP_CONFIDENCE,
      detail:
        setupConf >= MIN_SETUP_CONFIDENCE
          ? `${Math.round(setupConf)}% meets ≥${MIN_SETUP_CONFIDENCE}%`
          : `${Math.round(setupConf)}% below ${MIN_SETUP_CONFIDENCE}% gate`,
      critical: true,
    },
    {
      id: "evidence",
      label: "Evidence depth",
      passed: hits >= MIN_EVIDENCE_HITS,
      detail:
        hits >= MIN_EVIDENCE_HITS
          ? `${hits} factors ≥ ${EVIDENCE_FLOOR}%`
          : `Only ${hits} factors ≥ ${EVIDENCE_FLOOR}% (need ${MIN_EVIDENCE_HITS})`,
      critical: true,
    },
    {
      id: "historical",
      label: "Historical similarity",
      passed: historicalOk,
      detail: historicalOk
        ? `Similarity ${Math.round(historicalSimilarity)}% ≥ ${MIN_HISTORICAL_SIMILARITY}%`
        : `Similarity ${Math.round(historicalSimilarity)}% — setup does not resemble high-quality past patterns`,
      critical: true,
    },
    {
      id: "market_health",
      label: "Market health",
      passed: !setup || marketHealth.tradeable,
      detail: marketHealth.tradeable
        ? `Health ${marketHealth.score}% · ${marketHealth.liquidity} liquidity`
        : `Health ${marketHealth.score}% — not tradeable (${marketHealth.liquidity}, ${marketHealth.volatility})`,
      critical: true,
    },
  ];

  // No soft-pass on OB/FVG — missing zones must fail via confluence / zone_smc gates.

  const smcQuality = Math.round(
    ((ob?.confidence ?? 0) + (fvg?.confidence ?? 0) + (sweep?.confidence ?? 0)) /
      Math.max(1, smcCount || 1),
  );

  const confidenceFactors: Record<string, number> = {
    historical_similarity: historicalSimilarity,
    structure_quality: evidenceScores.market_structure ?? trend?.confidence ?? 0,
    trend_strength: trend?.confidence ?? 0,
    smc_quality: smcQuality || setupConf * 0.55,
    volume_quality: volQ,
    volatility_fit: volFit.score,
    mtf_agreement: Math.round(mtf.agreement * 100),
    strategy_quality: aligned ? clamp(80 + setupConf * 0.08, 0, 100) : 28,
  };

  const compositeConf = compositeConfidence(confidenceFactors);
  const institutional = computeInstitutionalScore(qualityChecks, compositeConf, marketHealth, mtf);

  const criticalPass = qualityChecks.filter((c) => c.critical).every((c) => c.passed);
  const preliminaryActionable = !!setup && criticalPass && directional;

  const selfReview = runSelfReview({
    checks: qualityChecks,
    institutional,
    mtf,
    marketHealth,
    preliminaryActionable,
    compositeConf,
    historicalSimilarity,
    smcCount,
    rrOk,
  });

  let kind: DecisionKind = "WAIT";
  let direction: "buy" | "sell" | "wait" = "wait";
  let tone: Tone = "warn";
  let actionable = false;

  if (selfReview.passed && bullish) {
    direction = "buy";
    tone = "bull";
    const strong =
      compositeConf >= STRONG_COMPOSITE &&
      setupConf >= STRONG_SETUP_CONFIDENCE &&
      institutional.score >= MIN_INSTITUTIONAL_STRONG;
    kind = strong ? "STRONG BUY" : "BUY";
    actionable = true;
  } else if (selfReview.passed && bearish) {
    direction = "sell";
    tone = "bear";
    const strong =
      compositeConf >= STRONG_COMPOSITE &&
      setupConf >= STRONG_SETUP_CONFIDENCE &&
      institutional.score >= MIN_INSTITUTIONAL_STRONG;
    kind = strong ? "STRONG SELL" : "SELL";
    actionable = true;
  }

  const rejectionReasons = qualityChecks
    .filter((c) => c.critical && !c.passed)
    .map((c) => `${c.label}: ${c.detail}`);
  if (!selfReview.passed && rejectionReasons.length === 0) {
    rejectionReasons.push(selfReview.note);
  }

  const unlockConditions = qualityChecks
    .filter((c) => !c.passed)
    .map((c) => `Clear «${c.label}» — ${c.detail}`)
    .concat(
      !mtf.htfAligned ? ["Align 4H and 1D bias with the setup direction"] : [],
      smcCount < MIN_SMC_CONFLUENCE
        ? [`Obtain ≥${MIN_SMC_CONFLUENCE} high-quality SMC factors (OB / FVG / Sweep)`]
        : [],
      institutional.score < MIN_INSTITUTIONAL_ACTION
        ? [`Raise institutional score to ≥${MIN_INSTITUTIONAL_ACTION}`]
        : [],
    )
    .slice(0, 8);

  const reasoning = actionable
    ? `${kind} — ${setup!.explanation} Institutional ${institutional.score} (${institutional.grade}). ${mtf.summary}. Self-review: would take with own capital.`
    : `WAIT — ${selfReview.note}`;

  const explainability = buildExplainability(
    kind,
    setup ?? null,
    trend,
    qualityChecks,
    institutional,
    marketHealth,
    unlockConditions,
  );

  const tradeQualityScore = actionable
    ? clamp(
        Math.round(
          compositeConf * 0.45 + institutional.score * 0.35 + historicalSimilarity * 0.2,
        ),
        0,
        100,
      )
    : clamp(Math.round(Math.min(compositeConf, institutional.score, 55)), 0, 58);

  const signalQuality: SignalQuality = {
    tradeQualityScore,
    institutionalScore: institutional.score,
    confidence: actionable ? compositeConf : Math.min(compositeConf || trend?.confidence || 35, 55),
    expectedRiskPct: riskPct,
    expectedRewardPct: rewardPct,
    riskReward: rrValue,
    historicalSimilarity,
  };

  const displayConfidence = signalQuality.confidence;

  const contributions: AiDecision["contributions"] = [
    { label: "Decision", value: kind, tone },
    {
      label: "Self-review",
      value: selfReview.passed ? "Would take (own capital)" : "Would NOT take — WAIT",
      tone: selfReview.passed ? "bull" : "warn",
    },
    {
      label: "Trade quality score",
      value: `${signalQuality.tradeQualityScore}`,
      tone: actionable ? "bull" : "warn",
    },
    {
      label: "Institutional score",
      value: `${institutional.score} · ${institutional.grade}`,
      tone: institutional.gradeTone,
    },
    { label: "Confidence", value: `${displayConfidence}%` },
    {
      label: "Expected risk",
      value: riskPct != null ? `${riskPct.toFixed(2)}%` : "—",
    },
    {
      label: "Expected reward",
      value: rewardPct != null ? `${rewardPct.toFixed(2)}%` : "—",
    },
    {
      label: "Risk / Reward",
      value: rrValue != null ? rrValue.toFixed(2) : "—",
      tone: rrOk ? "bull" : "warn",
    },
    {
      label: "Historical similarity",
      value: `${Math.round(historicalSimilarity)}%`,
      tone: historicalOk ? "bull" : "warn",
    },
    { label: "Actionable", value: actionable ? "Yes" : "No — WAIT" },
    { label: "Setup type", value: setupType },
    { label: "Strategy", value: strategyName },
    { label: "Trend", value: tLabel },
    { label: "MTF agreement", value: `${Math.round(mtf.agreement * 100)}%` },
    {
      label: "HTF (4H/1D)",
      value: mtf.htfAligned ? "Aligned" : "Not aligned",
      tone: mtf.htfAligned ? "bull" : "warn",
    },
    {
      label: "SMC confluence",
      value: `${smcCount}/${MIN_SMC_CONFLUENCE} required`,
      tone: smcConfluenceOk ? "bull" : "warn",
    },
    {
      label: "Market health",
      value: `${marketHealth.score}% · ${marketHealth.tradeable ? "Tradeable" : "Poor"}`,
      tone: marketHealth.tradeable ? "bull" : "warn",
    },
    {
      label: "Quality checks",
      value: `${qualityChecks.filter((c) => c.passed).length}/${qualityChecks.length}`,
    },
    { label: "Trade quality", value: actionable ? quality.label : "Insufficient", tone: actionable ? quality.tone : "warn" },
    { label: "Risk rating", value: actionable ? risk.label : "Unrated", tone: actionable ? risk.tone : "neutral" },
    { label: "Market phase", value: phase },
    ...mtf.timeframes.map((t) => ({
      label: `MTF ${t.timeframe}`,
      value: `${t.bias} (${Math.round(t.confidence)}%)`,
      tone:
        t.bias === "Bullish"
          ? ("bull" as Tone)
          : t.bias === "Bearish"
            ? ("bear" as Tone)
            : ("neutral" as Tone),
    })),
  ];

  if (!actionable && unlockConditions.length) {
    contributions.push({
      label: "Unlock BUY/SELL when",
      value: unlockConditions[0] ?? "—",
      tone: "info",
    });
  }

  return {
    kind,
    tone,
    confidence: displayConfidence,
    tradeQuality: actionable ? quality.label : "Insufficient",
    tradeQualityTone: actionable ? quality.tone : "warn",
    riskLabel: actionable ? risk.label : "Unrated",
    riskTone: actionable ? risk.tone : "neutral",
    setup: setup ?? null,
    setupType,
    strategyName,
    strategyId: strategy?.strategy_id ?? null,
    direction,
    marketPhase: phase,
    trendLabel: tLabel,
    evidenceSummary: topEvidence.length ? topEvidence : ["Awaiting confluence"],
    evidenceScores,
    reasoning,
    timestamp,
    contributions,
    actionable,
    qualityChecks,
    mtf,
    marketHealth,
    institutional,
    explainability,
    selfReview,
    confidenceFactors,
    signalQuality,
    rejectionReasons,
    unlockConditions,
  };
}

/** Chart markers — only paint BUY/SELL for actionable decisions. */
export function buildAnnotations(
  decision: AiDecision,
  _setups: TradeSetup[],
  strategyLookup: (setup: TradeSetup) => string,
): ChartAnnotation[] {
  const out: ChartAnnotation[] = [];

  if (!decision.actionable || !decision.setup) {
    out.push({
      time: decision.timestamp,
      side: "wait",
      label: "WAIT",
      confidence: decision.confidence,
      setupType: decision.setupType,
      strategy: decision.strategyName,
      timestamp: decision.timestamp,
    });
    return out;
  }

  const s = decision.setup;
  const side = decision.direction === "sell" ? "sell" : "buy";
  out.push({
    time: s.detected_at,
    side,
    label: decision.kind.includes("STRONG")
      ? side === "buy"
        ? "STRONG BUY"
        : "STRONG SELL"
      : side === "buy"
        ? "BUY"
        : "SELL",
    confidence: decision.confidence,
    setupType: titleCase(s.setup_type),
    strategy: strategyLookup(s),
    timestamp: s.detected_at,
  });

  return out;
}

export function annotationCaption(a: ChartAnnotation): string {
  return `${a.label} ${Math.round(a.confidence)}% · ${a.setupType}`;
}
