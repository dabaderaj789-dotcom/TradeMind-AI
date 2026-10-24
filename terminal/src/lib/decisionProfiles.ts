/**
 * TradeMind V6 — Decision Profiles.
 * Institutional gates live unchanged in decision.ts.
 * Intraday / Scalping use two-level models in intradayDecision.ts.
 */

export type DecisionProfileId = "institutional" | "intraday" | "scalping" | "swing";

export interface DecisionProfileMeta {
  id: DecisionProfileId;
  label: string;
  short: string;
  description: string;
  implemented: boolean;
}

/**
 * Intraday Professional model — two confidence levels.
 *
 * Level 1 Early (Quality B): discretionary tells before full BOS.
 * Level 2 Confirmed (Quality A): institutional-style confirmation on the chart TF.
 *
 * Do NOT lower Level 2 floors to chase signals — Early is the early path.
 */
export const INTRADAY_MODEL = {
  minConfluenceFactors: 3,
  chartTrendFloor: 52,
  setupConfidenceFloor: 58,
  obFloor: 58,
  fvgFloor: 55,
  sweepFloor: 55,
  minRr: 2.0,
  maxRiskPct: 2.25,
  volumeFloor: 48,
  minMtfAgreeCount: 2,
  requireHtfLock: false,
  confirmedRequiresStructure: true,
  confirmedPositionScale: 1.0,

  earlyPatternScoreFloor: 38,
  earlyMinPatternHits: 2,
  earlyMinRr: 1.8,
  earlyMaxRiskPct: 2.0,
  earlySetupConfidenceFloor: 48,
  earlyPositionScale: 0.5,
  earlyConfidenceCap: 64,
  earlyConfidenceFloor: 48,

  preferredTimeframes: ["1m", "5m", "15m"] as const,
  tradableSetupTypes: [
    "pullback",
    "trend_continuation",
    "breakout",
    "reversal",
    "range_rejection",
  ] as const,

  targetPointsMin: null as number | null,
  targetPointsMax: null as number | null,
  maxStopPoints: null as number | null,
  softMaxRiskPoints: null as number | null,
} as const;

/**
 * Scalping — short-duration opportunity filter for NIFTY / BANKNIFTY / SENSEX.
 *
 * Hard gate: RR ≥ 2.0 computed from structural Entry/SL (SL never fabricated).
 * Soft horizon: structural risk ≤ softMaxRiskPoints; wider SL → WAIT, do not shrink.
 * Does NOT lower confluence floors. Prefer NO TRADE over weak signals.
 */
export const SCALPING_MODEL = {
  ...INTRADAY_MODEL,
  chartTrendFloor: 54,
  setupConfidenceFloor: 60,
  obFloor: 60,
  fvgFloor: 58,
  sweepFloor: 58,
  /** Hard RR floor — computed from structural risk, never invented. */
  minRr: 2.0,
  maxRiskPct: 1.35,
  volumeFloor: 55,
  confirmedPositionScale: 0.75,

  earlyPatternScoreFloor: 42,
  earlyMinRr: 2.0,
  earlyMaxRiskPct: 1.2,
  earlySetupConfidenceFloor: 52,
  earlyPositionScale: 0.4,
  earlyConfidenceCap: 62,
  earlyConfidenceFloor: 50,

  preferredTimeframes: ["1m", "5m", "15m"] as const,
  /** Soft horizon only — not a target-point force. */
  targetPointsMin: null as number | null,
  targetPointsMax: null as number | null,
  maxStopPoints: null as number | null,
  /** Soft: structural SL wider than this → WAIT (do not shrink SL). */
  softMaxRiskPoints: 15,
} as const;

export type DecisionModel = typeof INTRADAY_MODEL | typeof SCALPING_MODEL;

export const DECISION_PROFILES: DecisionProfileMeta[] = [
  {
    id: "institutional",
    label: "Institutional",
    short: "INST",
    description: "Very selective · high confidence · capital preservation first",
    implemented: true,
  },
  {
    id: "intraday",
    label: "Intraday Professional",
    short: "INTRA",
    description: "Personality-first · Early (B) + Confirmed (A) · learns from sessions",
    implemented: true,
  },
  {
    id: "scalping",
    label: "Scalping",
    short: "SCALP",
    description: "1m/5m/15m · structural SL · RR≥2 · soft risk horizon · NO TRADE when noisy",
    implemented: true,
  },
  {
    id: "swing",
    label: "Swing",
    short: "SWING",
    description: "Placeholder — coming later",
    implemented: false,
  },
];

export function profileLabel(id: DecisionProfileId): string {
  return DECISION_PROFILES.find((p) => p.id === id)?.label ?? id;
}
