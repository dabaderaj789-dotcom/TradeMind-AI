/**
 * Late-session historical validation — walk sessions bar-by-bar in the late window.
 * Clock opens the analysis window only; direction comes from analyzeLateSession evidence.
 * Sample size is always reported.
 */

import { analyzeLateSession, type LateSessionSetup } from "./lateSessionIntelligence";
import type { Candle, Levels, StructureEvents, Trend } from "./types";
import type { ExpiryIntelligence } from "./expiryIntelligence";
import { num } from "./format";
import { sliceCandlesAtIndex } from "./replayGuard";

export interface LateSessionTradeOutcome {
  day: string;
  symbolCode: string;
  barIndex: number;
  decisionTs: string;
  classification: string;
  direction: "buy" | "sell" | "wait";
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  rr: number | null;
  mfe: number;
  mae: number;
  hitTp: boolean;
  hitSl: boolean;
  timeToTargetBars: number | null;
  timeToStopBars: number | null;
  expiry: boolean;
  dayType: "trend" | "range" | "unknown";
}

export interface LateSessionBacktestReport {
  sampleSize: number;
  sessions: number;
  setups: number;
  buys: number;
  sells: number;
  waits: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgMfe: number;
  avgMae: number;
  maxMove: number;
  avgRr: number | null;
  falseSignals: number;
  missedMoves: number;
  avgTimeToTargetBars: number | null;
  avgTimeToStopBars: number | null;
  expirySetups: number;
  nonExpirySetups: number;
  trendDaySetups: number;
  rangeDaySetups: number;
  outcomes: LateSessionTradeOutcome[];
  note: string;
}

function dayKeyFromCandle(c: Candle): string {
  const t = Date.parse(c.open_time);
  const ist = new Date(t + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function classifyDayType(session: Candle[]): "trend" | "range" | "unknown" {
  if (session.length < 20) return "unknown";
  const first = num(session[0].open);
  const last = num(session[session.length - 1].close);
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of session) {
    hi = Math.max(hi, num(c.high));
    lo = Math.min(lo, num(c.low));
  }
  const range = hi - lo;
  if (!(range > 0)) return "unknown";
  return Math.abs(last - first) / range >= 0.45 ? "trend" : "range";
}

function forwardExcursion(
  bars: Candle[],
  fromIndex: number,
  direction: "buy" | "sell",
  entry: number,
  stop: number,
  tp1: number,
): Pick<
  LateSessionTradeOutcome,
  "mfe" | "mae" | "hitTp" | "hitSl" | "timeToTargetBars" | "timeToStopBars"
> {
  let mfe = 0;
  let mae = 0;
  let hitTp = false;
  let hitSl = false;
  let timeToTargetBars: number | null = null;
  let timeToStopBars: number | null = null;
  for (let i = fromIndex + 1; i < bars.length; i++) {
    const c = bars[i];
    const hi = num(c.high);
    const lo = num(c.low);
    const barsAhead = i - fromIndex;
    if (direction === "buy") {
      mfe = Math.max(mfe, hi - entry);
      mae = Math.max(mae, entry - lo);
      if (!hitSl && lo <= stop) {
        hitSl = true;
        timeToStopBars = barsAhead;
        break;
      }
      if (!hitTp && hi >= tp1) {
        hitTp = true;
        timeToTargetBars = barsAhead;
        break;
      }
    } else {
      mfe = Math.max(mfe, entry - lo);
      mae = Math.max(mae, hi - entry);
      if (!hitSl && hi >= stop) {
        hitSl = true;
        timeToStopBars = barsAhead;
        break;
      }
      if (!hitTp && lo <= tp1) {
        hitTp = true;
        timeToTargetBars = barsAhead;
        break;
      }
    }
  }
  return { mfe, mae, hitTp, hitSl, timeToTargetBars, timeToStopBars };
}

/**
 * Run late-session analysis on historical candles.
 * Evaluates once per session at first bar inside the late window (and optional step).
 */
export function runLateSessionBacktest(opts: {
  sessions: Array<{
    symbolCode: string;
    candles: Candle[];
    trend?: Trend | null;
    levels?: Levels | null;
    structureEvents?: StructureEvents | null;
    expiry?: ExpiryIntelligence | null;
  }>;
  /** Evaluate every N bars inside window (default: once at first in-window bar). */
  stepBars?: number;
}): LateSessionBacktestReport {
  const step = Math.max(1, opts.stepBars ?? 9999);
  const outcomes: LateSessionTradeOutcome[] = [];
  let waits = 0;
  let missedMoves = 0;

  for (const sess of opts.sessions) {
    const candles = sess.candles;
    if (candles.length < 30) continue;
    const day = dayKeyFromCandle(candles[0]);
    const dayType = classifyDayType(candles);
    const expiry = !!sess.expiry?.active;
    let evaluated = 0;

    for (let i = 20; i < candles.length - 5; i++) {
      const slice = sliceCandlesAtIndex(candles, i);
      // Inject "now" via last candle time — analyzeLateSession uses Date.now by default.
      // We pass sliced candles; window check uses real clock unless we monkey-patch.
      // For historical, call with forced now from candle time:
      const last = slice[slice.length - 1];
      const now = new Date(Date.parse(last.open_time));
      const result = analyzeLateSessionAt(slice, sess, now);
      if (!result.inLateWindow) continue;
      if (evaluated > 0 && step >= 9999) break;
      if (evaluated > 0 && (i % step !== 0)) continue;
      evaluated++;

      if (result.direction === "wait" || result.classification === "no_late_session_setup") {
        waits++;
        // Missed move probe: if next 6 bars move ≥15 in one direction
        let up = 0;
        let down = 0;
        const px = num(last.close);
        for (let j = i + 1; j < Math.min(candles.length, i + 7); j++) {
          up = Math.max(up, num(candles[j].high) - px);
          down = Math.max(down, px - num(candles[j].low));
        }
        if (up >= 15 || down >= 15) missedMoves++;
        outcomes.push({
          day,
          symbolCode: sess.symbolCode,
          barIndex: i,
          decisionTs: last.open_time,
          classification: result.classification,
          direction: "wait",
          entry: null,
          stop: null,
          tp1: null,
          rr: null,
          mfe: Math.max(up, down),
          mae: 0,
          hitTp: false,
          hitSl: false,
          timeToTargetBars: null,
          timeToStopBars: null,
          expiry,
          dayType,
        });
        continue;
      }

      if (result.entry == null || result.stop == null || result.tp1 == null) continue;
      const fwd = forwardExcursion(
        candles,
        i,
        result.direction,
        result.entry,
        result.stop,
        result.tp1,
      );
      outcomes.push({
        day,
        symbolCode: sess.symbolCode,
        barIndex: i,
        decisionTs: last.open_time,
        classification: result.classification,
        direction: result.direction,
        entry: result.entry,
        stop: result.stop,
        tp1: result.tp1,
        rr: result.rr,
        ...fwd,
        expiry,
        dayType,
      });
    }
  }

  const setups = outcomes.filter((o) => o.direction !== "wait");
  const buys = setups.filter((o) => o.direction === "buy").length;
  const sells = setups.filter((o) => o.direction === "sell").length;
  const wins = setups.filter((o) => o.hitTp && !o.hitSl).length;
  const losses = setups.filter((o) => o.hitSl).length;
  const falseSignals = losses;
  const mfes = outcomes.map((o) => o.mfe);
  const maes = setups.map((o) => o.mae);
  const rrs = setups.map((o) => o.rr).filter((x): x is number => x != null);
  const tTargets = setups
    .map((o) => o.timeToTargetBars)
    .filter((x): x is number => x != null);
  const tStops = setups
    .map((o) => o.timeToStopBars)
    .filter((x): x is number => x != null);

  return {
    sampleSize: outcomes.length,
    sessions: opts.sessions.length,
    setups: setups.length,
    buys,
    sells,
    waits,
    wins,
    losses,
    winRate: setups.length ? Math.round((wins / setups.length) * 1000) / 10 : null,
    avgMfe: mfes.length ? Math.round((mfes.reduce((a, b) => a + b, 0) / mfes.length) * 100) / 100 : 0,
    avgMae: maes.length ? Math.round((maes.reduce((a, b) => a + b, 0) / maes.length) * 100) / 100 : 0,
    maxMove: mfes.length ? Math.round(Math.max(...mfes) * 100) / 100 : 0,
    avgRr: rrs.length ? Math.round((rrs.reduce((a, b) => a + b, 0) / rrs.length) * 100) / 100 : null,
    falseSignals,
    missedMoves,
    avgTimeToTargetBars: tTargets.length
      ? Math.round((tTargets.reduce((a, b) => a + b, 0) / tTargets.length) * 10) / 10
      : null,
    avgTimeToStopBars: tStops.length
      ? Math.round((tStops.reduce((a, b) => a + b, 0) / tStops.length) * 10) / 10
      : null,
    expirySetups: setups.filter((o) => o.expiry).length,
    nonExpirySetups: setups.filter((o) => !o.expiry).length,
    trendDaySetups: setups.filter((o) => o.dayType === "trend").length,
    rangeDaySetups: setups.filter((o) => o.dayType === "range").length,
    outcomes,
    note: "Observed historical late-session stats. Sample size is mandatory. Not a profitability claim.",
  };
}

/** analyzeLateSession with injectable "now" for historical replay. */
export function analyzeLateSessionAt(
  candles: Candle[],
  sess: {
    trend?: Trend | null;
    levels?: Levels | null;
    structureEvents?: StructureEvents | null;
    expiry?: ExpiryIntelligence | null;
  },
  now: Date,
): LateSessionSetup {
  return analyzeLateSession({
    candles,
    trend: sess.trend,
    levels: sess.levels ?? null,
    structureEvents: sess.structureEvents ?? null,
    expiry: sess.expiry,
    now,
  });
}
