/**
 * TradeMind V6 — AI Learning Mode journal.
 * Stores every signal; evaluates completed trades for future model improvement.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiDecision } from "./decision";
import type { DecisionProfileId } from "./decisionProfiles";
import type { PredictivePlan } from "./predictiveSignal";

export type JournalOutcome = "win" | "loss" | "breakeven" | "cancelled" | "open";

export interface AiJournalEntry {
  id: string;
  createdAt: string;
  completedAt: string | null;
  symbolId: string;
  symbolCode: string;
  timeframe: string;
  profile: DecisionProfileId;
  decision: "BUY" | "SELL" | "WAIT" | "STRONG BUY" | "STRONG SELL";
  direction: "buy" | "sell" | "wait";
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  riskReward: number | null;
  confidence: number;
  institutionalScore: number;
  reason: string;
  unlockConditions: string[];
  setupType: string;
  outcome: JournalOutcome;
  /** Did price hit TP1 before SL? */
  aiCorrect: boolean | null;
  lessons: string[];
  exitPrice: number | null;
}

interface AiJournalState {
  entries: AiJournalEntry[];
  recordSignal: (opts: {
    symbolId: string;
    symbolCode: string;
    timeframe: string;
    profile: DecisionProfileId;
    decision: AiDecision;
    plan: PredictivePlan | null;
  }) => void;
  completeTrade: (
    id: string,
    opts: { outcome: JournalOutcome; exitPrice: number; aiCorrect: boolean; lessons: string[] },
  ) => void;
  markPriceUpdate: (symbolId: string, timeframe: string, price: number) => void;
  clear: () => void;
}

function evalLessons(entry: AiJournalEntry, outcome: JournalOutcome): string[] {
  const lessons: string[] = [];
  if (outcome === "win") {
    lessons.push("AI direction was correct — keep this confluence pattern.");
    if ((entry.riskReward ?? 0) >= 2) lessons.push("R:R ≥ 2 held — structure targets worked.");
  } else if (outcome === "loss") {
    lessons.push("Could Entry improve? Wait for confirmation candle at OB/FVG.");
    lessons.push("Could SL improve? Place beyond structure swing, not inside noise.");
    lessons.push("Would another setup have been better? Prefer Sweep+BOS over weak pullbacks.");
  } else if (outcome === "cancelled") {
    lessons.push("Signal invalidated early — tighten freshness / confirmation rules.");
  }
  return lessons;
}

export const useAiJournal = create<AiJournalState>()(
  persist(
    (set, get) => ({
      entries: [],
      recordSignal: ({ symbolId, symbolCode, timeframe, profile, decision, plan }) => {
        const key = `${symbolId}:${timeframe}:${profile}:${decision.kind}:${decision.setup?.setup_id ?? "none"}`;
        const existing = get().entries.find((e) => e.id === key && e.outcome === "open");
        if (existing && decision.kind === existing.decision) return;

        // Throttle WAIT teaching notes — one per symbol/tf/profile per 10 minutes
        if (!decision.actionable) {
          const recentWait = get().entries.find(
            (e) =>
              e.symbolId === symbolId &&
              e.timeframe === timeframe &&
              e.profile === profile &&
              e.decision === "WAIT" &&
              Date.now() - Date.parse(e.createdAt) < 10 * 60_000,
          );
          if (recentWait) return;
        }

        const entry: AiJournalEntry = {
          id: key,
          createdAt: new Date().toISOString(),
          completedAt: null,
          symbolId,
          symbolCode,
          timeframe,
          profile,
          decision: decision.kind,
          direction: decision.direction,
          entry: plan?.entry ?? null,
          stop: plan?.stop ?? null,
          tp1: plan?.target1 ?? null,
          tp2: plan?.target2 ?? null,
          tp3: plan?.target3 ?? null,
          riskReward: plan?.riskReward ?? decision.signalQuality?.riskReward ?? null,
          confidence: decision.confidence,
          institutionalScore: decision.institutional?.score ?? 0,
          reason: decision.explainability?.whyDirection ?? decision.reasoning,
          unlockConditions: decision.unlockConditions ?? [],
          setupType: decision.setupType,
          outcome: decision.actionable ? "open" : "cancelled",
          aiCorrect: decision.actionable ? null : null,
          lessons: decision.actionable
            ? []
            : [`WAIT lesson: ${decision.unlockConditions?.slice(0, 3).join("; ") || "confluence incomplete"}`],
          exitPrice: null,
        };

        // WAIT entries are recorded once then closed as teaching notes
        if (!decision.actionable) {
          entry.completedAt = entry.createdAt;
          entry.outcome = "cancelled";
        }

        set((s) => {
          const withoutDup = s.entries.filter((e) => e.id !== key || e.outcome !== "open");
          return { entries: [entry, ...withoutDup].slice(0, 800) };
        });
      },

      completeTrade: (id, { outcome, exitPrice, aiCorrect, lessons }) => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  outcome,
                  exitPrice,
                  aiCorrect,
                  completedAt: new Date().toISOString(),
                  lessons: lessons.length ? lessons : evalLessons(e, outcome),
                }
              : e,
          ),
        }));
      },

      markPriceUpdate: (symbolId, timeframe, price) => {
        const open = get().entries.filter(
          (e) => e.symbolId === symbolId && e.timeframe === timeframe && e.outcome === "open",
        );
        if (!open.length) return;

        for (const e of open) {
          if (e.entry == null || e.stop == null || e.tp1 == null) continue;
          const long = e.direction === "buy";
          const hitSl = long ? price <= e.stop : price >= e.stop;
          const hitTp = long ? price >= e.tp1 : price <= e.tp1;
          if (hitSl) {
            get().completeTrade(e.id, {
              outcome: "loss",
              exitPrice: price,
              aiCorrect: false,
              lessons: evalLessons(e, "loss"),
            });
          } else if (hitTp) {
            get().completeTrade(e.id, {
              outcome: "win",
              exitPrice: price,
              aiCorrect: true,
              lessons: evalLessons(e, "win"),
            });
          }
        }
      },

      clear: () => set({ entries: [] }),
    }),
    { name: "trademind.ai-journal", version: 1 },
  ),
);
