/**
 * Post-close Expiry Review — compares AI decisions vs what the session did.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiJournalEntry } from "./aiJournal";
import type { ExpiryDayClass, ExpiryIntelligence } from "./expiryIntelligence";
import { num } from "./format";
import type { Candle } from "./types";

export interface ExpiryReview {
  id: string;
  symbolCode: string;
  expiryDate: string;
  generatedAt: string;
  dayClassAtClose: ExpiryDayClass | null;
  sessionOpen: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionClose: number | null;
  sessionChangePct: number | null;
  actualCharacter: string;
  decisions: Array<{
    kind: string;
    confidence: number;
    outcome: string | null;
    aiCorrect: boolean | null;
    reason: string;
  }>;
  scorecard: {
    signals: number;
    waits: number;
    wins: number;
    losses: number;
    openOrUnknown: number;
    agreementNote: string;
  };
  lessons: string[];
}

interface ExpiryReviewState {
  reviews: ExpiryReview[];
  /** Live snapshots during the expiry session (for review generation). */
  snapshots: Record<string, ExpiryIntelligence>;
  saveSnapshot: (symbolCode: string, expiryDate: string, intel: ExpiryIntelligence) => void;
  generateReview: (opts: {
    symbolCode: string;
    expiryDate: string;
    candles: Candle[];
    journal: AiJournalEntry[];
    intel: ExpiryIntelligence;
  }) => ExpiryReview | null;
  clear: () => void;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istYmd(d = new Date()): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

function sessionOhlc(candles: Candle[], expiryDate: string) {
  const dayBars = candles.filter((c) => {
    const ist = new Date(Date.parse(c.open_time) + IST_OFFSET_MS);
    const ymd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
    return ymd === expiryDate;
  });
  if (!dayBars.length) return null;
  const o = num(dayBars[0].open);
  let h = -Infinity;
  let l = Infinity;
  for (const c of dayBars) {
    h = Math.max(h, num(c.high));
    l = Math.min(l, num(c.low));
  }
  const cl = num(dayBars[dayBars.length - 1].close);
  return { o, h, l, c: cl, changePct: o > 0 ? ((cl - o) / o) * 100 : 0, bars: dayBars.length };
}

function describeActual(ohlc: NonNullable<ReturnType<typeof sessionOhlc>>): string {
  const span = ohlc.o > 0 ? ((ohlc.h - ohlc.l) / ohlc.o) * 100 : 0;
  const dir = ohlc.changePct;
  if (span < 0.35 && Math.abs(dir) < 0.15) return "Tight/expiry compression — little net progress";
  if (Math.abs(dir) >= 0.45 && span >= 0.7) return dir > 0 ? "Directional uptrend day" : "Directional downtrend day";
  if (span >= 0.8 && Math.abs(dir) < 0.25) return "Wide range / mean-reversion character";
  if (Math.abs(dir) >= 0.3) return dir > 0 ? "Bullish session bias" : "Bearish session bias";
  return "Two-sided / mixed session";
}

export const useExpiryReview = create<ExpiryReviewState>()(
  persist(
    (set) => ({
      reviews: [],
      snapshots: {},
      saveSnapshot: (symbolCode, expiryDate, intel) => {
        const key = `${symbolCode}:${expiryDate}`;
        set((s) => ({ snapshots: { ...s.snapshots, [key]: intel } }));
      },
      generateReview: ({ symbolCode, expiryDate, candles, journal, intel }) => {
        const ohlc = sessionOhlc(candles, expiryDate);
        const codeNorm = symbolCode.toUpperCase().replace(/\s/g, "");
        const dayJournal = journal.filter((j) => {
          const jc = j.symbolCode.toUpperCase().replace(/\s/g, "");
          const same =
            jc === codeNorm ||
            (codeNorm === "NIFTY50" && (jc === "NIFTY" || jc === "NIFTY50")) ||
            (codeNorm === "BANKNIFTY" && jc.includes("BANKNIFTY")) ||
            (codeNorm === "SENSEX" && jc.includes("SENSEX"));
          if (!same) return false;
          const ist = new Date(Date.parse(j.createdAt) + IST_OFFSET_MS);
          const ymd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
          return ymd === expiryDate;
        });

        const decisions = dayJournal.map((j) => ({
          kind: j.decision,
          confidence: j.confidence,
          outcome: j.outcome,
          aiCorrect: j.aiCorrect,
          reason: j.reason.slice(0, 220),
        }));

        const signals = dayJournal.filter((j) => j.decision !== "WAIT").length;
        const waits = dayJournal.filter((j) => j.decision === "WAIT").length;
        const wins = dayJournal.filter((j) => j.outcome === "win").length;
        const losses = dayJournal.filter((j) => j.outcome === "loss").length;
        const openOrUnknown = dayJournal.filter(
          (j) => j.outcome === "open" || j.aiCorrect == null,
        ).length;

        const actual = ohlc ? describeActual(ohlc) : "Insufficient session candles for OHLC review";
        const lessons: string[] = [];
        if (intel.dayClass === "Expiry Compression" && ohlc && Math.abs(ohlc.changePct) < 0.2) {
          lessons.push("Compression call matched a quiet settlement — WAIT / fade-premium bias was reasonable.");
        }
        if (intel.dayClass === "Trend Day" && ohlc && Math.abs(ohlc.changePct) >= 0.45) {
          lessons.push("Trend Day classification matched net directional progress.");
        }
        if (wins + losses > 0) {
          lessons.push(
            `Trade outcomes: ${wins} win / ${losses} loss — review entries that failed for tighter confirmation.`,
          );
        }
        if (signals === 0 && waits > 0) {
          lessons.push("AI stayed mostly WAIT — check whether a professional intraday trader would have taken more.");
        }
        if (!lessons.length) lessons.push("Collect more expiry sessions to harden the model.");

        const agreementNote =
          intel.dayClass && ohlc
            ? `AI day class «${intel.dayClass}» vs actual «${actual}».`
            : "Partial data — classification agreement inconclusive.";

        const review: ExpiryReview = {
          id: `${symbolCode}:${expiryDate}`,
          symbolCode,
          expiryDate,
          generatedAt: new Date().toISOString(),
          dayClassAtClose: intel.dayClass,
          sessionOpen: ohlc?.o ?? null,
          sessionHigh: ohlc?.h ?? null,
          sessionLow: ohlc?.l ?? null,
          sessionClose: ohlc?.c ?? null,
          sessionChangePct: ohlc?.changePct ?? null,
          actualCharacter: actual,
          decisions,
          scorecard: {
            signals,
            waits,
            wins,
            losses,
            openOrUnknown,
            agreementNote,
          },
          lessons,
        };

        set((s) => ({
          reviews: [review, ...s.reviews.filter((r) => r.id !== review.id)].slice(0, 40),
        }));
        return review;
      },
      clear: () => set({ reviews: [], snapshots: {} }),
    }),
    { name: "trademind.expiry-review", version: 1 },
  ),
);

/** True after NSE cash close (15:30 IST) on the given calendar day. */
export function isPastIndiaCashClose(now = new Date()): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 15 * 60 + 30;
}

export function todayIstYmd(now = new Date()): string {
  return istYmd(now);
}
