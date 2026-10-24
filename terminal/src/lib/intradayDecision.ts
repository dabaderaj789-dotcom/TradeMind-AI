/**
 * TradeMind V6 — Intraday Professional decision model (redesigned).
 *
 * Thinks like an experienced discretionary intraday trader:
 *   Level 1 Early (Quality B)  — enter on early tells, smaller size
 *   Level 2 Confirmed (Quality A) — full institutional confirmation on chart TF
 *
 * Institutional profile (decision.ts) is untouched.
 */

import { confidenceLabel, directionTone, num, riskRating, smcConfidencePct, titleCase, type Tone } from "./format";
import { INTRADAY_MODEL, SCALPING_MODEL, type DecisionModel } from "./decisionProfiles";
import { computeScalpGeometry, scalpRrAcceptable } from "./scalpGeometry";
import { scanEarlyPatterns } from "./intradayEarlyPatterns";
import {
  classifyMarketPersonality,
  earlyGateMultiplier,
  personalityAgrees,
  personalityNarrative,
  type MarketPersonality,
} from "./marketPersonality";
import type { PersonalityStats } from "./personalityLearning";
import type {
  AiDecision,
  DecisionKind,
  DecisionPersonality,
  Explainability,
  InstitutionalScore,
  IntradayDecisionMeta,
  MarketHealth,
  MtfAnalysis,
  MtfTimeframe,
  QualityCheck,
  SelfReview,
  SignalQuality,
} from "./decision";
import { MTF_TIMEFRAMES } from "./decision";
import type {
  AnalysisBar,
  Candle,
  Fvg,
  Levels,
  LiquiditySweep,
  OrderBlock,
  StrategyMetadata,
  StructureEvents,
  TradeSetup,
  Trend,
} from "./types";

function toDecisionPersonality(p: MarketPersonality): DecisionPersonality {
  return {
    id: p.id,
    label: p.label,
    bias: p.bias,
    strength: p.strength,
    confidence: p.confidence,
    characteristics: p.characteristics,
    preferredAction: p.preferredAction,
    alternatives: p.alternatives,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function atrPct(candles: Candle[], lookback = 14): number {
  if (candles.length < 2) return 0.35;
  const slice = candles.slice(-Math.min(lookback + 1, candles.length));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const h = num(slice[i].high);
    const l = num(slice[i].low);
    const pc = num(slice[i - 1].close);
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    sum += tr;
    n += 1;
  }
  const atr = n ? sum / n : 0;
  const px = num(slice[slice.length - 1].close);
  return px > 0 ? (atr / px) * 100 : 0.35;
}

function momentumDir(candles: Candle[]): "up" | "down" | "flat" {
  if (candles.length < 8) return "flat";
  const a = num(candles[candles.length - 8].close);
  const b = num(candles[candles.length - 1].close);
  if (a <= 0) return "flat";
  const chg = ((b - a) / a) * 100;
  if (chg > 0.12) return "up";
  if (chg < -0.12) return "down";
  return "flat";
}

function volumeQuality(candles: Candle[]): number {
  if (candles.length < 20) return 50;
  const vols = candles.slice(-20).map((c) => num(c.volume));
  const last = vols[vols.length - 1] ?? 0;
  const avg = vols.reduce((s, v) => s + v, 0) / vols.length;
  if (avg <= 0) return 50;
  return clamp(Math.round((last / avg) * 55), 0, 100);
}

function classifyIntradayPattern(
  setup: TradeSetup | null,
  bullish: boolean,
  hasOb: boolean,
  hasFvg: boolean,
  hasSweep: boolean,
  hasBos: boolean,
  hasChoch: boolean,
  earlyLabels: string[],
): string {
  if (earlyLabels.length && !hasBos) {
    return earlyLabels[0] ?? "Early discretionary";
  }
  const t = (setup?.setup_type ?? "").toLowerCase();
  if (hasSweep && hasBos) return "Liquidity Sweep + BOS";
  if (hasChoch && (hasOb || t.includes("reversal"))) return "CHoCH Reversal";
  if (t.includes("pullback") && hasOb) return bullish ? "Pullback to Bullish OB" : "Pullback to Bearish OB";
  if (t.includes("pullback")) return "BOS Retest / Pullback";
  if (t.includes("breakout") && hasOb) return "Break and Retest";
  if (t.includes("breakout") || t.includes("continuation")) return "Continuation Breakout";
  if (t.includes("range") || t.includes("rejection")) {
    return bullish ? "Strong Support Rejection" : "Strong Resistance Rejection";
  }
  if (hasBos && hasOb) return "BOS Retest";
  if (hasFvg && hasOb) return "OB + FVG Confluence";
  if (setup) return titleCase(setup.setup_type.replace(/_/g, " "));
  return earlyLabels[0] ?? "Structure Confluence";
}

function expectedRr(
  setup: TradeSetup,
  bullish: boolean,
  minRr: number,
  /** When false (scalping), never invent TP to clear minRr — use structure only. */
  allowProjectTp = true,
): {
  entry: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
  riskPct: number;
  rewardPct: number;
  rr: number;
  note: string;
} | null {
  const entry = (num(setup.entry_zone.low) + num(setup.entry_zone.high)) / 2;
  if (entry <= 0) return null;
  let stop = bullish ? num(setup.stop_loss_zone.low) : num(setup.stop_loss_zone.high);
  if (stop <= 0) return null;

  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;

  const engT1 = setup.target_zones[0]
    ? bullish
      ? num(setup.target_zones[0].high)
      : num(setup.target_zones[0].low)
    : null;
  const engT2 = setup.target_zones[1]
    ? bullish
      ? num(setup.target_zones[1].high)
      : num(setup.target_zones[1].low)
    : null;
  const engT3 = setup.target_zones[2]
    ? bullish
      ? num(setup.target_zones[2].high)
      : num(setup.target_zones[2].low)
    : null;

  const engRr =
    engT1 != null && risk > 0 ? Math.abs(engT1 - entry) / risk : setup.risk_reward != null ? num(setup.risk_reward) : 0;

  let t1: number;
  let t2: number;
  let t3: number;
  let note: string;

  if (engT1 != null && engRr >= minRr) {
    t1 = engT1;
    t2 = engT2 ?? (bullish ? entry + 3 * risk : entry - 3 * risk);
    t3 = engT3 ?? (bullish ? entry + 4 * risk : entry - 4 * risk);
    note = "Targets from setup geometry (structure zones).";
  } else if (!allowProjectTp) {
    // Scalping: keep structural TP if present; RR may be < minRr → WAIT upstream
    if (engT1 == null) return null;
    t1 = engT1;
    t2 = engT2 ?? engT1;
    t3 = engT3 ?? engT1;
    note = `Structural TP only — RR ${engRr.toFixed(2)} (need ≥${minRr}); will not invent TP.`;
  } else {
    t1 = bullish ? entry + minRr * risk : entry - minRr * risk;
    t2 = bullish ? entry + 3 * risk : entry - 3 * risk;
    t3 = bullish ? entry + 4 * risk : entry - 4 * risk;
    note = `TP projected from structure risk (${risk.toFixed(2)}) to clear ${minRr}:1 R:R.`;
  }

  const reward = Math.abs(t1 - entry);
  const rr = reward / risk;
  return {
    entry,
    stop,
    t1,
    t2,
    t3,
    riskPct: (risk / entry) * 100,
    rewardPct: (reward / entry) * 100,
    rr,
    note,
  };
}

function recentStructure(
  events: StructureEvents | null | undefined,
  bullish: boolean,
): { bos: boolean; choch: boolean; detail: string } {
  if (!events) return { bos: false, choch: false, detail: "No structure events loaded" };
  const bos = (events.bos_events ?? []).slice(-4);
  const choch = (events.choch_events ?? []).slice(-4);
  const bosHit = bos.some((e) => {
    const t = (e.event_type ?? "").toLowerCase();
    return bullish ? t.includes("bull") || t.includes("up") : t.includes("bear") || t.includes("down");
  });
  const bosAny = bos.length > 0;
  const chochHit = choch.some((e) => {
    const t = (e.event_type ?? "").toLowerCase();
    return bullish ? t.includes("bull") || t.includes("up") : t.includes("bear") || t.includes("down");
  });
  const chochAny = choch.length > 0;
  const hasBos = bosHit || (!bos.some((e) => /bull|bear|up|down/i.test(e.event_type)) && bosAny);
  const hasChoch = chochHit || (!choch.some((e) => /bull|bear|up|down/i.test(e.event_type)) && chochAny);
  return {
    bos: hasBos,
    choch: hasChoch,
    detail: hasBos
      ? `Recent BOS (${bos.length})`
      : hasChoch
        ? `Recent CHoCH (${choch.length})`
        : "BOS / CHoCH not yet — Early path may still apply",
  };
}

function buildIntradayMtf(
  mtfTrends: Partial<Record<MtfTimeframe, Trend | null | undefined>> | undefined,
  bullish: boolean,
  minMtfAgreeCount = INTRADAY_MODEL.minMtfAgreeCount,
): MtfAnalysis {
  const views = MTF_TIMEFRAMES.map((tf) => {
    const t = mtfTrends?.[tf];
    const tone = t ? directionTone(t.trend) : "neutral";
    const bias =
      tone === "bull" && (t?.confidence ?? 0) >= 45
        ? ("Bullish" as const)
        : tone === "bear" && (t?.confidence ?? 0) >= 45
          ? ("Bearish" as const)
          : ("Neutral" as const);
    return { timeframe: tf, bias, confidence: t?.confidence ?? 0 };
  });
  const matching = views.filter((v) => (bullish ? v.bias === "Bullish" : v.bias === "Bearish")).length;
  const agreement = matching / 4;
  const aligned = matching >= minMtfAgreeCount;
  return {
    timeframes: views,
    agreement,
    aligned,
    htfAligned: false,
    summary: aligned
      ? `Intraday MTF OK (${matching}/4 agree)`
      : `Need higher-timeframe agreement (${matching}/4 — want ≥${minMtfAgreeCount})`,
  };
}

function institutionalFromConfluence(score: number, factors: number, level: "early" | "confirmed"): InstitutionalScore {
  const s = clamp(Math.round(score), 0, 100);
  if (level === "confirmed") {
    if (s >= 85 && factors >= 5) return { score: s, grade: "Institutional Grade", gradeTone: "brand" };
    if (s >= 72 && factors >= 4) return { score: s, grade: "High Quality", gradeTone: "bull" };
    if (s >= 58 && factors >= 3) return { score: s, grade: "Tradeable", gradeTone: "info" };
  } else {
    if (s >= 58) return { score: s, grade: "Early Tradeable", gradeTone: "info" };
    if (s >= 45) return { score: s, grade: "Developing", gradeTone: "warn" };
  }
  if (s >= 40) return { score: s, grade: "Developing", gradeTone: "warn" };
  return { score: s, grade: "Avoid", gradeTone: "warn" };
}

/**
 * Intraday Professional decision — personality context first, then Level 1/2.
 */
export function deriveIntradayDecision(opts: {
  trend: Trend | null | undefined;
  setup: TradeSetup | null | undefined;
  strategy: StrategyMetadata | null | undefined;
  orderBlocks?: OrderBlock[];
  fvgs?: Fvg[];
  sweeps?: LiquiditySweep[];
  candles?: Candle[];
  structureEvents?: StructureEvents | null;
  levels?: Levels | null;
  mtfTrends?: Partial<Record<MtfTimeframe, Trend | null | undefined>>;
  emaBars?: AnalysisBar[] | null;
  vwapBars?: AnalysisBar[] | null;
  emaEnabled?: boolean;
  vwapEnabled?: boolean;
  /** Evidence-based earlyBias nudges from personalityLearning. */
  personalityStats?: PersonalityStats[];
  asOfFallback?: string;
  timeframe?: string;
  /** Defaults to Intraday; pass SCALPING_MODEL for scalping. */
  model?: DecisionModel;
}): AiDecision {
  const {
    trend,
    setup,
    strategy,
    orderBlocks = [],
    fvgs = [],
    sweeps = [],
    candles = [],
    structureEvents = null,
    levels = null,
    mtfTrends,
    emaBars = null,
    vwapBars = null,
    emaEnabled = false,
    vwapEnabled = true,
    personalityStats = [],
    asOfFallback,
    timeframe = "",
    model,
  } = opts;
  const M = model ?? INTRADAY_MODEL;

  const unlock: string[] = [];
  const checks: QualityCheck[] = [];
  const contributions: { label: string; value: string; tone?: Tone }[] = [];

  // Scalping: refuse wrong TF early (prefer NO TRADE over wrong-horizon signals)
  const preferredTfs = M.preferredTimeframes as readonly string[];
  const scalpTfOk = !(model === SCALPING_MODEL && timeframe && !preferredTfs.includes(timeframe));
  if (!scalpTfOk) {
    unlock.push(`Scalping prefers ${preferredTfs.join(" / ")} — switch timeframe or use Intraday.`);
  }

  // —— V8: classify market personality before any BUY/SELL/WAIT ——
  // Validation phase: OBSERVE/MEASURE/REPORT only — do NOT auto-tune earlyBias or floors.
  let personality = classifyMarketPersonality({ candles, levels, structureEvents });
  const learned = personalityStats.find((s) => s.personalityId === personality.id);
  if (learned && learned.samples >= 8) {
    personality = {
      ...personality,
      characteristics: [
        ...personality.characteristics,
        `Observed (not applied): ${learned.followThroughRate}% follow-through · n=${learned.samples} — recommend review only`,
      ],
    };
  }
  const persMeta = toDecisionPersonality(personality);
  const earlyMult = earlyGateMultiplier(personality);

  const earlyScan = scanEarlyPatterns({
    candles,
    levels,
    structureEvents,
    emaBars,
    vwapBars,
    emaEnabled,
    vwapEnabled,
  });

  if (!setup) {
    unlock.push("Need an active Trade Setup (Early still requires structure geometry for stop/targets)");
    unlock.push(`Market personality: ${personality.label}`);
    if (earlyScan.hits.length) {
      unlock.push(`Early evidence already forming: ${earlyScan.summary}`);
    }
    return waitDecision({
      trend,
      setup: null,
      strategy,
      checks: [
        {
          id: "setup",
          label: "Active setup",
          passed: false,
          detail: earlyScan.hits.length
            ? `No setup yet — early tells: ${earlyScan.summary}`
            : "No active setup — standing aside",
          critical: true,
        },
        {
          id: "personality",
          label: "Market personality",
          passed: personality.preferredAction !== "wait",
          detail: personalityNarrative(personality),
          critical: false,
        },
      ],
      unlock,
      contributions: [
        { label: "Profile", value: "Intraday Professional", tone: "info" },
        { label: "Personality", value: personality.label, tone: "brand" },
        { label: "Strength", value: `${personality.strength}%`, tone: "info" },
        { label: "Early score", value: `${earlyScan.score}`, tone: earlyScan.score >= 30 ? "warn" : "neutral" },
      ],
      asOfFallback,
      reasoning: `WAIT — ${personalityNarrative(personality)}. ${
        earlyScan.hits.length
          ? `Early tells forming (${earlyScan.summary}) but no Trade Setup geometry yet.`
          : "Await setup that fits this personality."
      }`,
      earlyScan,
      personality: persMeta,
    });
  }

  const bullish = setup.direction === "buy";
  const setupConf = clamp(num(setup.confidence_score), 0, 100);
  const setupTypeOk = M.tradableSetupTypes.some((t) =>
    setup.setup_type.toLowerCase().includes(t),
  );

  const chartTrendOk =
    !!trend &&
    ((bullish && directionTone(trend.trend) === "bull") ||
      (!bullish && directionTone(trend.trend) === "bear")) &&
    trend.confidence >= M.chartTrendFloor;

  const atr = atrPct(candles);
  const volQ = volumeQuality(candles);
  const mom = momentumDir(candles);
  const momOk = (bullish && mom === "up") || (!bullish && mom === "down");

  const bestOb = orderBlocks
    .filter((o) => {
      const side = (o.type ?? "").toLowerCase();
      const sideOk = bullish ? side.includes("bull") : side.includes("bear");
      return (
        sideOk &&
        !/mitigat|invalid/i.test(o.mitigation_state ?? "") &&
        smcConfidencePct(o.confidence) >= M.obFloor
      );
    })
    .sort((a, b) => b.confidence - a.confidence)[0];

  const bestFvg = fvgs
    .filter((f) => {
      const side = (f.type ?? "").toLowerCase();
      const sideOk = bullish ? side.includes("bull") : side.includes("bear");
      return sideOk && (f.fill_percentage ?? 100) < 70 && smcConfidencePct(f.confidence) >= M.fvgFloor;
    })
    .sort((a, b) => b.confidence - a.confidence)[0];

  const bestSweep = sweeps
    .filter((s) => {
      const side = (s.type ?? "").toLowerCase();
      const sideOk = bullish
        ? side.includes("buy") || side.includes("low") || side.includes("bull")
        : side.includes("sell") || side.includes("high") || side.includes("bear");
      return sideOk && smcConfidencePct(s.confidence) >= M.sweepFloor;
    })
    .sort((a, b) => b.confidence - a.confidence)[0];

  const struct = recentStructure(structureEvents, bullish);
  const allowProjectTp = model !== SCALPING_MODEL;
  const levelsConfirmed = expectedRr(setup, bullish, M.minRr, allowProjectTp);
  const levelsEarly = expectedRr(setup, bullish, M.earlyMinRr, allowProjectTp);
  const mtf = buildIntradayMtf(mtfTrends, bullish, M.minMtfAgreeCount);

  const alignedEarly = earlyScan.hits.filter((h) => h.direction === (bullish ? "buy" : "sell"));
  // Personality-adjusted early floors (learned + live earlyBias)
  const adjEarlyScoreFloor = clamp(
    Math.round(M.earlyPatternScoreFloor / earlyMult),
    28,
    48,
  );
  const adjEarlyMinHits = earlyMult >= 1.1 ? 2 : earlyMult <= 0.85 ? 3 : M.earlyMinPatternHits;
  const earlyAligned =
    alignedEarly.length >= adjEarlyMinHits &&
    earlyScan.score >= adjEarlyScoreFloor &&
    (earlyScan.preferredDirection === (bullish ? "buy" : "sell") ||
      earlyScan.preferredDirection === "wait");

  const personalityAlign = personalityAgrees(personality, bullish ? "buy" : "sell");
  const personalityOpposes =
    personality.preferredAction !== "wait" &&
    personality.preferredAction !== (bullish ? "buy" : "sell") &&
    personality.strength >= 62 &&
    personality.confidence >= 55;
  const personalityWaitContext =
    personality.preferredAction === "wait" && personality.strength >= 55 && personality.confirmPatience > 0.4;

  type Factor = { id: string; label: string; hit: boolean; teach: string; weight: number };
  const factors: Factor[] = [
    {
      id: "setup_quality",
      label: "Setup quality",
      hit: setupConf >= M.setupConfidenceFloor && setupTypeOk,
      teach: setupTypeOk
        ? `Need setup confidence ≥${M.setupConfidenceFloor}% (now ${Math.round(setupConf)}%)`
        : "Need a tradable intraday setup type (pullback / BOS / breakout / reversal)",
      weight: 1.2,
    },
    {
      id: "chart_trend",
      label: "Chart trend",
      hit: chartTrendOk,
      teach: "Need stronger trend on this timeframe aligned with trade direction",
      weight: 1.1,
    },
    {
      id: "structure",
      label: "BOS / CHoCH",
      hit: struct.bos || struct.choch,
      teach: "Need BOS or CHoCH for Confirmed (A) — Early (B) can fire without this",
      weight: 1.3,
    },
    {
      id: "order_block",
      label: "Order block",
      hit: !!bestOb,
      teach: bullish ? "Need pullback into a bullish Order Block" : "Need rally into a bearish Order Block",
      weight: 1.2,
    },
    {
      id: "fvg",
      label: "Fair value gap",
      hit: !!bestFvg,
      teach: "Need FVG in trade direction (partially unfilled)",
      weight: 0.9,
    },
    {
      id: "sweep",
      label: "Liquidity sweep",
      hit: !!bestSweep,
      teach: "Need liquidity sweep before entry (stop-hunt then reverse)",
      weight: 1.0,
    },
    {
      id: "momentum",
      label: "Momentum",
      hit: momOk,
      teach: "Need confirmation candle / momentum in trade direction",
      weight: 0.9,
    },
    {
      id: "volume",
      label: "Volume",
      hit: volQ >= M.volumeFloor,
      teach: `Need better participation (volume quality ${volQ}% < ${M.volumeFloor}%)`,
      weight: 0.8,
    },
    {
      id: "mtf",
      label: "MTF agreement",
      hit: mtf.aligned,
      teach: mtf.summary.includes("Need") ? mtf.summary : "Need higher timeframe agreement (≥2 of 15m/1h/4h/1d)",
      weight: 1.0,
    },
    {
      id: "rr",
      label: "Reward : Risk",
      hit:
        !!levelsConfirmed &&
        levelsConfirmed.rr >= M.minRr &&
        levelsConfirmed.riskPct <= M.maxRiskPct,
      teach: !levelsConfirmed
        ? "Need valid entry / stop from structure"
        : levelsConfirmed.rr < M.minRr
          ? `Need better R:R (now ${levelsConfirmed.rr.toFixed(2)} — want ≥${M.minRr})`
          : `Risk ${levelsConfirmed.riskPct.toFixed(2)}% exceeds intraday max ${M.maxRiskPct}%`,
      weight: 1.4,
    },
    {
      id: "early_patterns",
      label: "Early discretionary tells",
      hit: earlyAligned,
      teach: earlyScan.summary,
      weight: 1.25,
    },
    {
      id: "personality",
      label: "Market personality",
      hit: personalityAlign || (personality.preferredAction === "wait" && personality.strength < 55),
      teach: personalityOpposes
        ? `Personality ${personality.label} opposes this ${bullish ? "BUY" : "SELL"}`
        : personalityNarrative(personality),
      weight: 1.45,
    },
  ];

  const hits = factors.filter((f) => f.hit);
  const hitCount = hits.length;
  const weighted =
    factors.reduce((s, f) => s + (f.hit ? f.weight : 0), 0) /
    factors.reduce((s, f) => s + f.weight, 0);
  const confluenceScore = clamp(Math.round(weighted * 100), 0, 100);

  for (const f of factors) {
    const criticalConfirmed = ["setup_quality", "rr", "structure"].includes(f.id);
    checks.push({
      id: f.id,
      label: f.label,
      passed: f.hit,
      detail: f.hit ? `${f.label} OK` : f.teach,
      // Structure is critical only for Confirmed — Early explicitly allows no BOS
      critical: criticalConfirmed && f.id !== "early_patterns",
    });
    if (!f.hit && f.id !== "early_patterns") unlock.push(f.teach);
    contributions.push({
      label: f.label,
      value: f.hit ? "✓" : "—",
      tone: f.hit ? "bull" : "neutral",
    });
  }

  const pattern = classifyIntradayPattern(
    setup,
    bullish,
    !!bestOb,
    !!bestFvg,
    !!bestSweep,
    struct.bos,
    struct.choch,
    alignedEarly.map((h) => h.label),
  );

  const hasZoneSmc = !!bestOb || !!bestFvg || struct.bos || struct.choch || !!bestSweep || earlyAligned;
  if (!hasZoneSmc) unlock.push("Need OB, FVG, sweep, BOS, or early discretionary tells");

  const lateConfirmations: string[] = [];
  if (!struct.bos && !struct.choch) lateConfirmations.push("BOS / CHoCH");
  if (!bestSweep) lateConfirmations.push("Liquidity sweep");
  if (!bestOb) lateConfirmations.push("Order block retest");
  if (!mtf.aligned) lateConfirmations.push("MTF agreement");

  // —— Level 2 Confirmed (Quality A) ——
  const confirmedCriticalOk = checks
    .filter((c) => ["setup_quality", "rr", "structure"].includes(c.id))
    .every((c) => c.passed);
  const confirmedConfluenceOk =
    hitCount >= M.minConfluenceFactors &&
    hasZoneSmc &&
    (struct.bos || struct.choch || !M.confirmedRequiresStructure);
  // Strong opposing personality blocks Confirmed unless structure is overwhelming
  const confirmedPersonalityOk = !personalityOpposes || (hitCount >= 6 && (struct.bos || struct.choch));
  const confirmedPatienceOk = !(personalityWaitContext && personality.confirmPatience > 0.55 && hitCount < 5);

  /** Absolute index-point geometry for scalping — RR from structural Entry/SL/TP only. */
  function pointsOk(
    levels: { entry: number; stop: number; t1: number; rr: number } | null,
    bullishSide: boolean,
  ): { ok: boolean; teach: string; geomRr?: number } {
    if (model !== SCALPING_MODEL) return { ok: true, teach: "" };
    if (!levels) return { ok: false, teach: "No structural Entry/SL/TP — WAIT" };
    const softMax =
      "softMaxRiskPoints" in M && M.softMaxRiskPoints != null ? M.softMaxRiskPoints : 15;
    const geom = computeScalpGeometry({
      entry: levels.entry,
      stop: levels.stop,
      bullish: bullishSide,
      minRr: M.minRr,
      engineTp1: levels.t1,
      softMaxRiskPoints: softMax,
    });
    if (!geom) return { ok: false, teach: "Cannot compute scalp geometry from Entry/SL" };
    if (!scalpRrAcceptable(geom, M.minRr)) {
      return {
        ok: false,
        teach: geom.teach || `RR ${geom.rr.toFixed(2)} < ${M.minRr} or risk outside scalp horizon`,
        geomRr: geom.rr,
      };
    }
    return { ok: true, teach: geom.teach, geomRr: geom.rr };
  }
  const confirmedPts = pointsOk(levelsConfirmed, bullish);
  const earlyPts = pointsOk(levelsEarly, bullish);
  if (!confirmedPts.ok) unlock.push(confirmedPts.teach);
  if (!earlyPts.ok && confirmedPts.ok) unlock.push(earlyPts.teach);

  const confirmed =
    scalpTfOk &&
    confirmedConfluenceOk &&
    confirmedCriticalOk &&
    confirmedPersonalityOk &&
    confirmedPatienceOk &&
    !!levelsConfirmed &&
    levelsConfirmed.rr >= M.minRr &&
    levelsConfirmed.riskPct <= M.maxRiskPct &&
    confirmedPts.ok;

  // —— Level 1 Early (Quality B) ——
  const earlyRrOk =
    !!levelsEarly &&
    levelsEarly.rr >= M.earlyMinRr &&
    levelsEarly.riskPct <= M.earlyMaxRiskPct;
  const earlySetupOk = setupConf >= M.earlySetupConfidenceFloor && setupTypeOk;
  const earlyDirectionOk =
    earlyScan.preferredDirection === (bullish ? "buy" : "sell") ||
    (earlyAligned && (momOk || chartTrendOk));
  // Personality must agree (or be soft) for Early — this is the context-first gate
  const earlyPersonalityOk = personalityAlign && !personalityWaitContext;
  const early =
    scalpTfOk &&
    !confirmed &&
    earlyAligned &&
    earlyRrOk &&
    earlySetupOk &&
    earlyDirectionOk &&
    earlyPersonalityOk &&
    hasZoneSmc &&
    !personalityOpposes &&
    earlyPts.ok;

  const planLevels = confirmed ? levelsConfirmed : levelsEarly;
  let setupLevel: "early" | "confirmed" | null = null;
  if (confirmed) setupLevel = "confirmed";
  else if (early) setupLevel = "early";

  const actionable = setupLevel !== null;

  const institutional = institutionalFromConfluence(
    confluenceScore * 0.55 + setupConf * 0.45,
    hitCount,
    setupLevel === "early" ? "early" : "confirmed",
  );

  const selfReview: SelfReview = actionable
    ? {
        passed: true,
        note:
          setupLevel === "confirmed"
            ? `Confirmed (A) in ${personality.label}: ${pattern} · R:R ${planLevels!.rr.toFixed(2)}. Full size.`
            : `Early (B) because market is ${personality.label} — ${personality.characteristics.slice(0, 2).join("; ")}. Half size.`,
      }
    : {
        passed: false,
        note: personalityOpposes
          ? `WAIT — setup fights personality (${personality.label}). Context overrules isolated patterns.`
          : `WAIT — personality ${personality.label}. Early needs alignment + tells; Confirmed needs BOS+confluence.`,
      };

  let kind: DecisionKind = "WAIT";
  if (actionable && selfReview.passed) {
    if (setupLevel === "confirmed") {
      const strong = hitCount >= 6 && setupConf >= 72 && institutional.score >= 78;
      kind = bullish ? (strong ? "STRONG BUY" : "BUY") : strong ? "STRONG SELL" : "SELL";
    } else {
      // Early — never STRONG; Quality B
      kind = bullish ? "BUY" : "SELL";
    }
  }

  const direction: "buy" | "sell" | "wait" = kind.includes("BUY")
    ? "buy"
    : kind.includes("SELL")
      ? "sell"
      : "wait";

  let conf: number;
  if (setupLevel === "confirmed") {
    conf = clamp(Math.round(setupConf * 0.5 + confluenceScore * 0.5), 0, 100);
  } else if (setupLevel === "early") {
    conf = clamp(
      Math.round(M.earlyConfidenceFloor + earlyScan.score * 0.25 + setupConf * 0.15),
      M.earlyConfidenceFloor,
      M.earlyConfidenceCap,
    );
  } else {
    conf = clamp(Math.round(Math.max(confluenceScore * 0.55, earlyScan.score * 0.6)), 0, 55);
  }

  const tradeGrade: "A" | "B" | null = setupLevel === "confirmed" ? "A" : setupLevel === "early" ? "B" : null;
  const positionScale =
    setupLevel === "confirmed"
      ? M.confirmedPositionScale
      : setupLevel === "early"
        ? M.earlyPositionScale
        : 0;

  const intradayMeta: IntradayDecisionMeta | undefined = setupLevel
    ? {
        setupLevel,
        tradeGrade: tradeGrade!,
        positionScale,
        earlyPatterns: alignedEarly.map((h) => h.label),
        earlyScore: earlyScan.score,
        lateConfirmations,
        levelNote:
          setupLevel === "confirmed"
            ? "Level 2 Confirmed — institutional confirmation on chart TF. Normal position."
            : `Level 1 Early — entered before full BOS. Smaller position (${Math.round(positionScale * 100)}%). Late confirms still pending: ${lateConfirmations.slice(0, 3).join(", ") || "none"}.`,
      }
    : undefined;

  if (personalityOpposes) {
    unlock.unshift(`Personality ${personality.label} opposes this direction — do not force the pattern checklist`);
  }

  const marketHealth: MarketHealth = {
    trend: trend?.trend ?? "Unknown",
    volatility: atr < 0.2 ? "Low" : atr > 0.8 ? "High" : "Normal",
    liquidity: volQ >= 60 ? "Adequate" : "Thin",
    momentum: mom === "up" ? "Bullish" : mom === "down" ? "Bearish" : "Flat",
    phase: personality.label,
    score: clamp(Math.round((personality.strength + personality.confidence + volQ) / 3), 0, 100),
    tradeable: actionable || hitCount >= 2 || earlyScan.score >= 30,
  };

  // Blend personality into displayed confidence
  if (setupLevel === "confirmed") {
    conf = clamp(Math.round(conf * 0.7 + personality.confidence * 0.3), 0, 100);
  } else if (setupLevel === "early") {
    conf = clamp(Math.round(conf * 0.55 + personality.strength * 0.25 + personality.confidence * 0.2), M.earlyConfidenceFloor, M.earlyConfidenceCap);
  }

  const explainability: Explainability = {
    whyDirection: actionable
      ? setupLevel === "confirmed"
        ? `${kind} — market personality is ${personality.label} (${personality.strength}% / ${personality.confidence}% conf). ${personality.characteristics.slice(0, 3).join("; ")}. Confirmed (A) · R:R ${planLevels!.rr.toFixed(2)}.`
        : `${kind} — market personality is ${personality.label} (${personality.strength}% / ${personality.confidence}% conf). ${personality.characteristics.slice(0, 4).join("; ")}. Early (B) · size ${Math.round(positionScale * 100)}%.`
      : `WAIT — personality ${personality.label}. ${personality.characteristics.slice(0, 2).join("; ") || earlyScan.summary}. ${unlock.slice(0, 2).join("; ")}.`,
    whyNotOpposite: actionable
      ? `Opposite side rejected: personality bias is ${personality.bias} (${personality.label}).`
      : personalityOpposes
        ? `Directional setup fights ${personality.label} — standing aside.`
        : "Neither side clears personality-aligned Early/Confirmed gates.",
    whyNow: actionable
      ? setupLevel === "early"
        ? `Context: ${personality.label} favors ${personality.preferredAction.toUpperCase()} before full BOS. Patterns are supporting evidence, not the thesis.`
        : `Timing: Confirmed structure inside ${personality.label}.`
      : unlock.length
        ? `Not yet. ${unlock.slice(0, 3).join(" · ")}.`
        : "Not yet — personality or confluence incomplete.",
    invalidation: planLevels
      ? `Invalid if personality flips, or price closes beyond stop ${planLevels.stop.toFixed(2)}.`
      : "No plan until entry/stop are defined by structure.",
    improvements: unlock.slice(0, 8),
  };

  const signalQuality: SignalQuality = {
    tradeQualityScore: setupLevel === "early" ? clamp(earlyScan.score + 20, 0, 75) : confluenceScore,
    institutionalScore: institutional.score,
    confidence: conf,
    expectedRiskPct: planLevels?.riskPct ?? null,
    expectedRewardPct: planLevels?.rewardPct ?? null,
    riskReward: planLevels?.rr ?? null,
    historicalSimilarity: clamp(Math.round(setupConf * 0.85), 0, 100),
  };

  const tone: Tone = direction === "buy" ? "bull" : direction === "sell" ? "bear" : "warn";
  const tq =
    setupLevel === "confirmed"
      ? { label: "Quality A · Confirmed", tone: "bull" as Tone }
      : setupLevel === "early"
        ? { label: "Quality B · Early", tone: "info" as Tone }
        : confidenceLabel(conf);
  const rrRate = riskRating(planLevels?.rr ?? null);

  return {
    kind,
    tone,
    confidence: conf,
    tradeQuality: tq.label,
    tradeQualityTone: tq.tone,
    riskLabel: rrRate.label,
    riskTone: rrRate.tone,
    setup,
    setupType: pattern,
    strategyName: strategy?.strategy_name ?? "Intraday Structure",
    strategyId: strategy?.strategy_id ?? null,
    direction,
    marketPhase: marketHealth.phase,
    trendLabel: trend?.trend ?? "—",
    evidenceSummary: [
      ...hits.map((h) => h.label),
      ...alignedEarly.slice(0, 3).map((h) => h.label),
    ].slice(0, 8),
    evidenceScores: Object.fromEntries([
      ...factors.map((f) => [f.id, f.hit ? 80 : 30]),
      ...alignedEarly.map((h) => [h.id, Math.round(h.weight * 40)]),
    ]),
    reasoning: explainability.whyDirection,
    timestamp: setup.detected_at || trend?.as_of || asOfFallback || new Date().toISOString(),
    contributions: [
      { label: "Profile", value: "Intraday Professional", tone: "info" },
      { label: "Personality", value: personality.label, tone: "brand" },
      { label: "Pers. strength", value: `${personality.strength}%`, tone: "info" },
      { label: "Pers. conf", value: `${personality.confidence}%`, tone: "info" },
      ...(setupLevel
        ? [
            {
              label: "Level",
              value: setupLevel === "confirmed" ? "2 · Confirmed (A)" : "1 · Early (B)",
              tone: (setupLevel === "confirmed" ? "bull" : "info") as Tone,
            },
            {
              label: "Size",
              value: `${Math.round(positionScale * 100)}%`,
              tone: "brand" as Tone,
            },
          ]
        : []),
      { label: "Pattern", value: pattern, tone: "brand" },
      { label: "Early score", value: `${earlyScan.score}`, tone: earlyAligned ? "bull" : "neutral" },
      { label: "Confluence", value: `${hitCount}/${factors.length}`, tone: actionable ? "bull" : "warn" },
      ...(planLevels ? [{ label: "R:R", value: planLevels.rr.toFixed(2), tone: "brand" as Tone }] : []),
      ...contributions,
    ],
    actionable: direction !== "wait",
    qualityChecks: checks.map((c) =>
      c.id === "structure" && setupLevel === "early"
        ? { ...c, critical: false, detail: c.passed ? c.detail : "Optional for Early (B) — pending for Confirmed (A)" }
        : c,
    ),
    mtf,
    marketHealth,
    institutional,
    explainability,
    selfReview,
    confidenceFactors: Object.fromEntries(factors.map((f) => [f.id, f.hit ? f.weight * 20 : 0])),
    signalQuality,
    rejectionReasons: actionable ? [] : unlock.slice(0, 8),
    unlockConditions: unlock.slice(0, 8),
    intraday: intradayMeta,
    personality: persMeta,
  };
}

function waitDecision(opts: {
  trend: Trend | null | undefined;
  setup: TradeSetup | null;
  strategy: StrategyMetadata | null | undefined;
  checks: QualityCheck[];
  unlock: string[];
  contributions: { label: string; value: string; tone?: Tone }[];
  asOfFallback?: string;
  reasoning: string;
  earlyScan?: ReturnType<typeof scanEarlyPatterns>;
  personality?: DecisionPersonality;
}): AiDecision {
  const institutional: InstitutionalScore = { score: 28, grade: "Avoid", gradeTone: "warn" };
  const tq = confidenceLabel(18);
  const early = opts.earlyScan;
  const pers = opts.personality;
  return {
    kind: "WAIT",
    tone: "warn",
    confidence: early ? clamp(Math.round(early.score * 0.45), 12, 45) : 18,
    tradeQuality: tq.label,
    tradeQualityTone: tq.tone,
    riskLabel: "Unrated",
    riskTone: "neutral",
    setup: opts.setup,
    setupType: opts.setup ? titleCase(opts.setup.setup_type.replace(/_/g, " ")) : "No active setup",
    strategyName: opts.strategy?.strategy_name ?? "—",
    strategyId: opts.strategy?.strategy_id ?? null,
    direction: "wait",
    marketPhase: pers?.label ?? opts.trend?.market_phase ?? "—",
    trendLabel: opts.trend?.trend ?? "—",
    evidenceSummary: [
      ...(pers?.characteristics.slice(0, 3) ?? []),
      ...(early?.hits.slice(0, 3).map((h) => h.label) ?? []),
    ],
    evidenceScores: {},
    reasoning: opts.reasoning,
    timestamp: opts.setup?.detected_at || opts.trend?.as_of || opts.asOfFallback || new Date().toISOString(),
    contributions: opts.contributions,
    actionable: false,
    qualityChecks: opts.checks,
    mtf: {
      timeframes: MTF_TIMEFRAMES.map((tf) => ({ timeframe: tf, bias: "Neutral", confidence: 0 })),
      agreement: 0,
      aligned: false,
      htfAligned: false,
      summary: "Intraday — waiting for personality-aligned setup",
    },
    marketHealth: {
      trend: opts.trend?.trend ?? "—",
      volatility: "—",
      liquidity: "—",
      momentum: "—",
      phase: pers?.label ?? opts.trend?.market_phase ?? "—",
      score: pers?.strength ?? early?.score ?? 0,
      tradeable: false,
    },
    institutional,
    explainability: {
      whyDirection: opts.reasoning,
      whyNotOpposite: "No directional edge until personality and Early/Confirmed gates align.",
      whyNow: opts.unlock.length ? `Missing: ${opts.unlock.slice(0, 4).join("; ")}.` : "Standing aside.",
      invalidation: "N/A while WAIT.",
      improvements: opts.unlock,
    },
    selfReview: {
      passed: false,
      note: pers
        ? `Personality ${pers.label} classified first. Trade only when setup agrees with this context.`
        : "No trade — incomplete Early/Confirmed confluence.",
    },
    confidenceFactors: {},
    signalQuality: {
      tradeQualityScore: early?.score ?? 18,
      institutionalScore: 28,
      confidence: early ? clamp(Math.round(early.score * 0.45), 12, 45) : 18,
      expectedRiskPct: null,
      expectedRewardPct: null,
      riskReward: null,
      historicalSimilarity: 0,
    },
    rejectionReasons: opts.unlock,
    unlockConditions: opts.unlock,
    personality: pers,
  };
}
