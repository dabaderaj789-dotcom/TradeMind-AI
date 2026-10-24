/**
 * Missed Opportunity — WAIT follow-through with 10/15/20/25 point ladders.
 * Tracks MFE/MAE; does not auto-tune production thresholds.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiDecision } from "./decision";
import type { DecisionProfileId } from "./decisionProfiles";

export type MissedClass =
  | "correct_wait"
  | "incorrect_wait"
  | "missed_buy"
  | "missed_sell"
  | "taken_buy"
  | "taken_sell";

export const MISS_POINT_THRESHOLDS = [10, 15, 20, 25] as const;

export interface MissedOpportunityRecord {
  id: string;
  day: string;
  createdAt: string;
  resolvedAt: string | null;
  symbolId: string;
  symbolCode: string;
  timeframe: string;
  profile: DecisionProfileId;
  decisionKind: string;
  aiAction: "WAIT" | "BUY" | "SELL";
  hypotheticalSide: "buy" | "sell" | null;
  earlyScore: number;
  earlyEvidence: string[];
  whyWaited: string[];
  lateConfirmations: string[];
  priceAtDecision: number;
  /** Peak favorable excursion (points) after decision. */
  mfe: number | null;
  /** Peak adverse excursion (points) after decision. */
  mae: number | null;
  /** Best favorable move at resolve (alias of mfe for WAIT miss). */
  missedPoints: number | null;
  /** Which ladder thresholds were crossed (10/15/20/25). */
  thresholdsHit: number[];
  hadEarlySetupEvidence: boolean;
  hadConfirmedPathBlocked: boolean;
  expectedRr: number | null;
  classification: MissedClass;
  selfAsk: string;
  lessons: string[];
}

export interface MissedOpportunityDayReport {
  day: string;
  totalBuy: number;
  totalSell: number;
  correctWait: number;
  incorrectWait: number;
  missedBuy: number;
  missedSell: number;
  averageMissedPoints: number;
  averageMfe: number;
  averageMae: number;
  hit10: number;
  hit15: number;
  hit20: number;
  hit25: number;
  expectedRrAvg: number | null;
  missedOpportunityScore: number;
  records: MissedOpportunityRecord[];
  sampleSize: number;
}

interface MissedOpportunityState {
  records: MissedOpportunityRecord[];
  recordDecision: (opts: {
    symbolId: string;
    symbolCode: string;
    timeframe: string;
    profile: DecisionProfileId;
    decision: AiDecision;
    price: number;
  }) => void;
  evaluatePrice: (symbolId: string, timeframe: string, price: number) => void;
  dayReport: (day?: string) => MissedOpportunityDayReport;
  clear: () => void;
}

function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function scoreFromReport(
  r: Omit<MissedOpportunityDayReport, "missedOpportunityScore" | "records" | "sampleSize">,
): number {
  const waits = r.correctWait + r.incorrectWait;
  const misses = r.missedBuy + r.missedSell;
  const taken = r.totalBuy + r.totalSell;
  if (waits + taken === 0) return 100;
  const raw =
    100 -
    ((misses * 12 + r.incorrectWait * 8) / Math.max(1, waits + taken)) * 10 +
    ((r.correctWait * 2 + taken) / Math.max(1, waits + taken)) * 5;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function thresholdsCrossed(favorable: number): number[] {
  return MISS_POINT_THRESHOLDS.filter((t) => favorable >= t);
}

export const useMissedOpportunity = create<MissedOpportunityState>()(
  persist(
    (set, get) => ({
      records: [],

      recordDecision: ({ symbolId, symbolCode, timeframe, profile, decision, price }) => {
        if (profile !== "intraday" && profile !== "scalping") return;
        if (!(price > 0)) return;

        const earlyScore =
          decision.intraday?.earlyScore ?? decision.signalQuality?.tradeQualityScore ?? 0;
        const earlyEvidence =
          decision.intraday?.earlyPatterns ??
          decision.evidenceSummary.filter((e) =>
            /lower high|higher low|rejection|pullback|exhaustion|breakdown|breakout|vwap|ema|volume|failure|swing|liquidity/i.test(
              e,
            ),
          );

        const hadEarlySetupEvidence =
          earlyScore >= 35 ||
          earlyEvidence.length >= 2 ||
          decision.intraday?.setupLevel === "early";
        const hadConfirmedPathBlocked =
          !decision.actionable &&
          (decision.unlockConditions?.some((u) => /bos|choch|confirm|r:r|rr|structure/i.test(u)) ??
            false);

        const hypo: "buy" | "sell" | null = decision.actionable
          ? decision.direction === "buy"
            ? "buy"
            : decision.direction === "sell"
              ? "sell"
              : null
          : earlyEvidence.length >= 2 || earlyScore >= 28
            ? /sell|bear|break.*down|lower high|weak pullback|resistance/i.test(earlyEvidence.join(" "))
              ? "sell"
              : /buy|bull|break.*out|higher low|support/i.test(earlyEvidence.join(" "))
                ? "buy"
                : decision.tone === "bear"
                  ? "sell"
                  : decision.tone === "bull"
                    ? "buy"
                    : null
            : null;

        if (decision.actionable) {
          const side: "BUY" | "SELL" = decision.direction === "buy" ? "BUY" : "SELL";
          const id = `${symbolId}:${timeframe}:taken:${decision.setup?.setup_id ?? decision.kind}:${dayKey()}`;
          if (get().records.some((r) => r.id === id)) return;
          const rec: MissedOpportunityRecord = {
            id,
            day: dayKey(),
            createdAt: new Date().toISOString(),
            resolvedAt: new Date().toISOString(),
            symbolId,
            symbolCode,
            timeframe,
            profile,
            decisionKind: decision.kind,
            aiAction: side,
            hypotheticalSide: decision.direction === "wait" ? null : decision.direction,
            earlyScore,
            earlyEvidence,
            whyWaited: [],
            lateConfirmations: decision.intraday?.lateConfirmations ?? [],
            priceAtDecision: price,
            mfe: 0,
            mae: 0,
            missedPoints: 0,
            thresholdsHit: [],
            hadEarlySetupEvidence: decision.intraday?.setupLevel === "early",
            hadConfirmedPathBlocked: decision.intraday?.setupLevel === "confirmed",
            expectedRr: decision.signalQuality?.riskReward ?? null,
            classification: side === "BUY" ? "taken_buy" : "taken_sell",
            selfAsk: decision.intraday?.levelNote ?? decision.selfReview?.note ?? "",
            lessons:
              decision.intraday?.setupLevel === "early"
                ? ["Early (B) taken — upgrade to Confirmed (A) if BOS arrives."]
                : ["Confirmed (A) taken."],
          };
          set((s) => ({ records: [rec, ...s.records].slice(0, 800) }));
          return;
        }

        if (!hypo) return;

        const id = `${symbolId}:${timeframe}:wait:${hypo}:${dayKey()}`;
        const recent = get().records.find(
          (r) => r.id === id && !r.resolvedAt && Date.now() - Date.parse(r.createdAt) < 45 * 60_000,
        );
        if (recent) return;

        const whyWaited =
          decision.unlockConditions?.slice(0, 5) ?? decision.rejectionReasons?.slice(0, 5) ?? [];
        const late = decision.intraday?.lateConfirmations?.length
          ? decision.intraday.lateConfirmations
          : whyWaited.filter((w) => /bos|choch|sweep|order block|mtf/i.test(w));

        const waitRec: MissedOpportunityRecord = {
          id,
          day: dayKey(),
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          symbolId,
          symbolCode,
          timeframe,
          profile,
          decisionKind: "WAIT",
          aiAction: "WAIT",
          hypotheticalSide: hypo,
          earlyScore,
          earlyEvidence,
          whyWaited,
          lateConfirmations: late,
          priceAtDecision: price,
          mfe: 0,
          mae: 0,
          missedPoints: null,
          thresholdsHit: [],
          hadEarlySetupEvidence,
          hadConfirmedPathBlocked,
          expectedRr: decision.signalQuality?.riskReward ?? null,
          classification: "correct_wait",
          selfAsk: `Could a valid Early/Confirmed ${hypo.toUpperCase()} have been taken? Early score ${earlyScore}.`,
          lessons: [],
        };
        set((s) => ({
          records: [waitRec, ...s.records.filter((r) => r.id !== id)].slice(0, 800),
        }));
      },

      evaluatePrice: (symbolId, timeframe, price) => {
        if (!(price > 0)) return;
        set((s) => {
          const next = s.records.map((r) => {
            if (r.symbolId !== symbolId || r.timeframe !== timeframe) return r;
            if (r.resolvedAt || r.aiAction !== "WAIT" || !r.hypotheticalSide) return r;

            const ageMin = (Date.now() - Date.parse(r.createdAt)) / 60_000;
            const move = price - r.priceAtDecision;
            const favorable = r.hypotheticalSide === "sell" ? -move : move;
            const adverse = -favorable;
            const mfe = Math.max(r.mfe ?? 0, favorable);
            const mae = Math.max(r.mae ?? 0, adverse);
            const hit = thresholdsCrossed(mfe);

            // Update running MFE/MAE every tick
            let updated: MissedOpportunityRecord = {
              ...r,
              mfe: Math.round(mfe * 100) / 100,
              mae: Math.round(mae * 100) / 100,
              thresholdsHit: hit,
            };

            if (ageMin < 2) return updated;

            // Miss ONLY if valid executable setup existed.
            // Price move alone is NOT a missed opportunity.
            const missFloor = 15;

            // Stricter: require early/confirmed evidence
            if (mfe >= missFloor && (r.hadEarlySetupEvidence || r.hadConfirmedPathBlocked)) {
              const triggerReached =
                r.hypotheticalSide === "buy"
                  ? price <= r.priceAtDecision + Math.max(2, mfe * 0.1) || mfe >= missFloor
                  : price >= r.priceAtDecision - Math.max(2, mfe * 0.1) || mfe >= missFloor;
              // "Trigger reached" for WAIT miss: favorable excursion implies price moved through
              // a would-be entry near decision price when early evidence existed.
              if (triggerReached) {
                return {
                  ...updated,
                  resolvedAt: new Date().toISOString(),
                  missedPoints: Math.round(mfe * 100) / 100,
                  classification:
                    r.hypotheticalSide === "buy" ? ("missed_buy" as const) : ("missed_sell" as const),
                  lessons: [
                    `WAIT at ${r.priceAtDecision.toFixed(2)} · MFE ${mfe.toFixed(1)} · MAE ${(updated.mae ?? 0).toFixed(1)}.`,
                    `Valid setup evidence: Early=${r.hadEarlySetupEvidence ? "YES" : "NO"} ConfirmedBlocked=${r.hadConfirmedPathBlocked ? "YES" : "NO"}.`,
                    `Thresholds hit: ${hit.length ? hit.join("/") + " pts" : "none"}.`,
                    `Why waited: ${r.whyWaited.slice(0, 2).join("; ") || "confirmation"}.`,
                    "Counted as miss because executable Early/Confirmed path existed — not merely because price moved.",
                  ],
                };
              }
            }

            if (mfe >= missFloor && !r.hadEarlySetupEvidence && !r.hadConfirmedPathBlocked) {
              return {
                ...updated,
                resolvedAt: new Date().toISOString(),
                missedPoints: 0,
                classification: "correct_wait" as const,
                lessons: [
                  `Price moved ${mfe.toFixed(1)} pts but NO valid Early/Confirmed setup existed — NOT a missed opportunity.`,
                  `Why waited: ${r.whyWaited.slice(0, 2).join("; ") || "no setup"}.`,
                ],
              };
            }

            if (mae >= missFloor || ageMin >= 90) {
              return {
                ...updated,
                resolvedAt: new Date().toISOString(),
                missedPoints: 0,
                classification: "correct_wait" as const,
                lessons: [
                  `WAIT justified · MFE ${mfe.toFixed(1)} · MAE ${(updated.mae ?? 0).toFixed(1)}.`,
                  "No tradable miss criteria within window.",
                ],
              };
            }
            return updated;
          });
          return { records: next };
        });
      },

      dayReport: (day) => {
        const d = day ?? dayKey();
        const records = get().records.filter((r) => r.day === d);
        const totalBuy = records.filter((r) => r.classification === "taken_buy").length;
        const totalSell = records.filter((r) => r.classification === "taken_sell").length;
        const correctWait = records.filter((r) => r.classification === "correct_wait").length;
        const incorrectWait = records.filter(
          (r) =>
            r.classification === "incorrect_wait" ||
            r.classification === "missed_buy" ||
            r.classification === "missed_sell",
        ).length;
        const missedBuy = records.filter((r) => r.classification === "missed_buy").length;
        const missedSell = records.filter((r) => r.classification === "missed_sell").length;
        const missedPts = records
          .filter((r) => r.missedPoints != null && r.missedPoints > 0)
          .map((r) => r.missedPoints!);
        const averageMissedPoints = missedPts.length
          ? Math.round((missedPts.reduce((a, b) => a + b, 0) / missedPts.length) * 100) / 100
          : 0;
        const mfes = records.map((r) => r.mfe).filter((x): x is number => x != null);
        const maes = records.map((r) => r.mae).filter((x): x is number => x != null);
        const averageMfe = mfes.length
          ? Math.round((mfes.reduce((a, b) => a + b, 0) / mfes.length) * 100) / 100
          : 0;
        const averageMae = maes.length
          ? Math.round((maes.reduce((a, b) => a + b, 0) / maes.length) * 100) / 100
          : 0;
        const hit10 = records.filter((r) => r.thresholdsHit.includes(10)).length;
        const hit15 = records.filter((r) => r.thresholdsHit.includes(15)).length;
        const hit20 = records.filter((r) => r.thresholdsHit.includes(20)).length;
        const hit25 = records.filter((r) => r.thresholdsHit.includes(25)).length;
        const rrs = records.map((r) => r.expectedRr).filter((x): x is number => x != null && x > 0);
        const expectedRrAvg = rrs.length
          ? Math.round((rrs.reduce((a, b) => a + b, 0) / rrs.length) * 100) / 100
          : null;
        const base = {
          day: d,
          totalBuy,
          totalSell,
          correctWait,
          incorrectWait,
          missedBuy,
          missedSell,
          averageMissedPoints,
          averageMfe,
          averageMae,
          hit10,
          hit15,
          hit20,
          hit25,
          expectedRrAvg,
        };
        return {
          ...base,
          missedOpportunityScore: scoreFromReport(base),
          records,
          sampleSize: records.length,
        };
      },

      clear: () => set({ records: [] }),
    }),
    { name: "trademind.missedOpportunity.v2" },
  ),
);

export function formatMissedReport(r: MissedOpportunityDayReport): string {
  return [
    `Day ${r.day} (n=${r.sampleSize})`,
    `BUY ${r.totalBuy} · SELL ${r.totalSell}`,
    `Correct WAIT ${r.correctWait} · Incorrect WAIT ${r.incorrectWait}`,
    `Missed BUY ${r.missedBuy} · Missed SELL ${r.missedSell}`,
    `Avg miss ${r.averageMissedPoints} · MFE ${r.averageMfe} · MAE ${r.averageMae}`,
    `Hits 10/15/20/25: ${r.hit10}/${r.hit15}/${r.hit20}/${r.hit25}`,
    `Score ${r.missedOpportunityScore}/100 (observed — not a profit claim)`,
  ].join(" · ");
}
