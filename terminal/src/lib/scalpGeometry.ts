/**
 * Scalping trade geometry — RR from structural Entry/SL/TP only.
 * Never invent SL. Never invent TP just to pass RR.
 * If structural RR < minRr → caller must WAIT.
 */

export interface ScalpGeometry {
  entry: number;
  stop: number;
  riskPoints: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  rewardPoints: number;
  rr: number;
  /** Soft horizon check — structural SL too wide for short-duration scalp. */
  withinScalpHorizon: boolean;
  /** True only when structural TP already clears minRr (no projection). */
  structuralRrOk: boolean;
  teach: string;
}

/** Soft ceiling: if structural risk exceeds this, prefer WAIT (do not shrink SL). */
export const SCALP_SOFT_MAX_RISK_POINTS = 15;

/**
 * Evaluate geometry from structural levels only.
 * `engineTp1` must come from setup target zones — never synthesized here to hit RR.
 */
export function computeScalpGeometry(opts: {
  entry: number;
  stop: number;
  bullish: boolean;
  minRr: number;
  /** Structural / setup TP1 — required for RR acceptance. */
  engineTp1: number | null | undefined;
  engineTp2?: number | null;
  engineTp3?: number | null;
  softMaxRiskPoints?: number;
}): ScalpGeometry | null {
  const { entry, stop, minRr } = opts;
  if (!(entry > 0) || !(stop > 0)) return null;
  const riskPoints = Math.abs(entry - stop);
  if (!(riskPoints > 0)) return null;

  const softMax = opts.softMaxRiskPoints ?? SCALP_SOFT_MAX_RISK_POINTS;
  const withinScalpHorizon = riskPoints <= softMax;

  if (opts.engineTp1 == null || !Number.isFinite(opts.engineTp1)) {
    return {
      entry,
      stop,
      riskPoints,
      tp1: entry,
      tp2: null,
      tp3: null,
      rewardPoints: 0,
      rr: 0,
      withinScalpHorizon,
      structuralRrOk: false,
      teach: `No structural TP — WAIT (will not invent TP for ${minRr}:1). Risk ${riskPoints.toFixed(1)} pts.`,
    };
  }

  const tp1 = opts.engineTp1;
  const rewardPoints = Math.abs(tp1 - entry);
  const rr = rewardPoints / riskPoints;
  const structuralRrOk = rr + 1e-9 >= minRr;
  const minReward = minRr * riskPoints;

  let teach: string;
  if (!structuralRrOk) {
    teach = `Structural RR ${rr.toFixed(2)} < ${minRr} (reward ${rewardPoints.toFixed(1)} < ${minReward.toFixed(1)} needed) — WAIT. Do not move TP.`;
  } else if (!withinScalpHorizon) {
    teach = `Structural RR ${rr.toFixed(2)} ok but risk ${riskPoints.toFixed(1)} > scalp horizon ${softMax} — WAIT (do not shrink SL).`;
  } else {
    teach = `Structural geometry OK · risk ${riskPoints.toFixed(1)} · reward ${rewardPoints.toFixed(1)} · RR ${rr.toFixed(2)}.`;
  }

  return {
    entry,
    stop,
    riskPoints,
    tp1,
    tp2: opts.engineTp2 ?? null,
    tp3: opts.engineTp3 ?? null,
    rewardPoints,
    rr,
    withinScalpHorizon,
    structuralRrOk,
    teach,
  };
}

export function scalpRrAcceptable(geom: ScalpGeometry | null, minRr: number): boolean {
  if (!geom) return false;
  return geom.structuralRrOk && geom.withinScalpHorizon && geom.rr + 1e-9 >= minRr;
}

/** Pure RR identity check for acceptance tests. */
export function assertRrIdentity(entry: number, stop: number, tp: number): {
  risk: number;
  reward: number;
  rr: number;
} {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(tp - entry);
  return { risk, reward, rr: risk > 0 ? reward / risk : 0 };
}
