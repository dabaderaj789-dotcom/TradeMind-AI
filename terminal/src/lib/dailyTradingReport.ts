/**
 * Daily trading report — aggregates missed + paper + validation.
 * Observed counts only; sample size always shown. No auto-learn.
 */

import { useMissedOpportunity, type MissedOpportunityDayReport } from "./missedOpportunity";
import { usePaperTrading, type PaperDayStats } from "./paperTrading";
import { useLiveValidation } from "./liveValidation";
import { usePersonalityLearning } from "./personalityLearning";

export interface DailyTradingReport {
  day: string;
  generatedAt: string;
  sampleSize: number;
  signals: number;
  buys: number;
  sells: number;
  waits: number;
  early: number;
  confirmed: number;
  wins: number;
  losses: number;
  correctWait: number;
  incorrectWait: number;
  missed10: number;
  missed15: number;
  missed20: number;
  missed25: number;
  averageMissedPoints: number;
  averageMfe: number;
  averageMae: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  bestSetup: string | null;
  worstSetup: string | null;
  bestPersonality: string | null;
  worstPersonality: string | null;
  lateSessionSetups: number;
  lateSessionWaits: number;
  expiryEvents: number;
  missed: MissedOpportunityDayReport;
  paper: PaperDayStats;
  note: string;
}

export function buildDailyTradingReport(day?: string): DailyTradingReport {
  const missed = useMissedOpportunity.getState().dayReport(day);
  const paper = usePaperTrading.getState().dayStats(day);
  const d = day ?? missed.day;
  const events = useLiveValidation.getState().events.filter(
    (e) => e.id.startsWith(d) || e.snapshot.tsUtc.startsWith(d),
  );
  const allPers = usePersonalityLearning.getState().stats();
  const ranked = [...allPers].sort((a, b) => b.followThroughRate - a.followThroughRate);
  const best = ranked[0];
  const worst = ranked.length ? ranked[ranked.length - 1] : undefined;

  const early = events.filter((e) => e.snapshot.earlyOrConfirmed === "early").length;
  const confirmed = events.filter((e) => e.snapshot.earlyOrConfirmed === "confirmed").length;
  const buys = events.filter((e) => e.snapshot.decision.includes("BUY")).length;
  const sells = events.filter((e) => e.snapshot.decision.includes("SELL")).length;
  const waits = events.filter((e) => e.snapshot.decision === "WAIT").length;

  // Best/worst setup from paper closed trades by pnl
  const dayTrades = usePaperTrading
    .getState()
    .trades.filter((t) => t.day === d && t.status === "closed");
  const sorted = [...dayTrades].sort((a, b) => (b.pnlPoints ?? 0) - (a.pnlPoints ?? 0));
  const bestSetup = sorted[0]
    ? `${sorted[0].side} ${sorted[0].setupLevel ?? "?"} ${sorted[0].pnlPoints}pts`
    : null;
  const worstSetup = sorted.length
    ? `${sorted[sorted.length - 1].side} ${sorted[sorted.length - 1].setupLevel ?? "?"} ${sorted[sorted.length - 1].pnlPoints}pts`
    : null;

  return {
    day: d,
    generatedAt: new Date().toISOString(),
    sampleSize: events.length || missed.sampleSize || paper.sampleSize,
    signals: buys + sells,
    buys,
    sells,
    waits,
    early,
    confirmed,
    wins: paper.wins,
    losses: paper.losses,
    correctWait: missed.correctWait,
    incorrectWait: missed.incorrectWait,
    missed10: missed.hit10,
    missed15: missed.hit15,
    missed20: missed.hit20,
    missed25: missed.hit25,
    averageMissedPoints: missed.averageMissedPoints,
    averageMfe: missed.averageMfe || paper.avgMfe,
    averageMae: missed.averageMae || paper.avgMae,
    winRate: paper.winRate,
    profitFactor: paper.profitFactor,
    expectancy: paper.expectancy,
    bestSetup,
    worstSetup,
    bestPersonality: best ? `${best.label} (n=${best.samples})` : null,
    worstPersonality: worst ? `${worst.label} (n=${worst.samples})` : null,
    lateSessionSetups: events.filter(
      (e) =>
        e.snapshot.lateSessionClass &&
        e.snapshot.lateSessionClass !== "no_late_session_setup",
    ).length,
    lateSessionWaits: events.filter(
      (e) => e.snapshot.lateSessionClass === "no_late_session_setup",
    ).length,
    expiryEvents: events.filter((e) => e.snapshot.expiryActive).length,
    missed,
    paper,
    note: "OBSERVE · MEASURE · REPORT · RECOMMEND only. No automatic threshold changes. Not an accuracy% claim.",
  };
}

export function formatDailyTradingReport(r: DailyTradingReport): string {
  return [
    `Daily ${r.day} · n=${r.sampleSize}`,
    `Signals ${r.signals} (BUY ${r.buys} / SELL ${r.sells}) · WAIT ${r.waits}`,
    `Early ${r.early} · Confirmed ${r.confirmed}`,
    `Wins ${r.wins} · Losses ${r.losses} · WR ${r.winRate ?? "—"}% · PF ${r.profitFactor ?? "—"} · Exp ${r.expectancy ?? "—"}`,
    `Correct WAIT ${r.correctWait} · Incorrect WAIT ${r.incorrectWait}`,
    `Missed ladders 10/15/20/25: ${r.missed10}/${r.missed15}/${r.missed20}/${r.missed25}`,
    `Avg miss ${r.averageMissedPoints} · MFE ${r.averageMfe} · MAE ${r.averageMae}`,
    `Best ${r.bestSetup ?? "—"} · Worst ${r.worstSetup ?? "—"}`,
    `Personality best ${r.bestPersonality ?? "—"} · worst ${r.worstPersonality ?? "—"}`,
    `3PM setups ${r.lateSessionSetups} · waits ${r.lateSessionWaits} · Expiry events ${r.expiryEvents}`,
    r.note,
  ].join("\n");
}
