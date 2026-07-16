import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiDecision } from "../lib/decision";
import type { PredictivePlan } from "../lib/predictiveSignal";
import {
  applyOutcomeEvents,
  cancelTrackedTrade,
  computePerformanceSnapshot,
  createTrackedTrade,
  eventsFromPlanState,
  type PerformanceSnapshot,
  type TrackedTrade,
} from "../lib/tradeAnalytics";

interface BacktestState {
  runs: Record<string, string>;
  setRun: (key: string, runId: string) => void;
  /** Live trade journal — every generated plan’s lifecycle. */
  trades: TrackedTrade[];
  upsertFromPlan: (opts: {
    plan: PredictivePlan;
    decision: AiDecision;
    symbolId: string;
    symbolCode: string;
    market: string;
    timeframe: string;
  }) => void;
  cancelActive: (symbolId: string, timeframe: string, price: number, note?: string) => void;
  clearTrades: () => void;
  snapshot: () => PerformanceSnapshot;
}

export const useBacktestStore = create<BacktestState>()(
  persist(
    (set, get) => ({
      runs: {},
      setRun: (key, runId) => set((s) => ({ runs: { ...s.runs, [key]: runId } })),
      trades: [],
      upsertFromPlan: ({ plan, decision, symbolId, symbolCode, market, timeframe }) => {
        const id = `${symbolId}:${timeframe}:${plan.setup.setup_id}`;
        set((s) => {
          const existing = s.trades.find((t) => t.id === id);
          let trade = existing ?? createTrackedTrade({ plan, decision, symbolId, symbolCode, market, timeframe });
          if (trade.completed) return s;

          // Refresh confidence / institutional if still open
          trade = {
            ...trade,
            confidence: plan.confidence,
            institutional_score: decision.institutional.score,
            strategy_name: plan.strategyName,
            strategy_id: decision.strategyId,
          };

          const eventTypes = eventsFromPlanState(plan.state, plan.hitFlags);
          trade = applyOutcomeEvents(trade, eventTypes, plan.lastPrice);

          const others = s.trades.filter((t) => t.id !== id);
          // Cap journal size
          const trades = [trade, ...others].slice(0, 500);
          return { trades };
        });
      },
      cancelActive: (symbolId, timeframe, price, note) => {
        set((s) => ({
          trades: s.trades.map((t) => {
            if (t.completed) return t;
            if (t.symbol_id !== symbolId || t.timeframe !== timeframe) return t;
            return cancelTrackedTrade(t, price, note);
          }),
        }));
      },
      clearTrades: () => set({ trades: [] }),
      snapshot: () => computePerformanceSnapshot(get().trades),
    }),
    {
      name: "trademind.performance",
      version: 1,
      partialize: (s) => ({ runs: s.runs, trades: s.trades }),
    },
  ),
);

/** Selector helper for React components. */
export function usePerformanceSnapshot(): PerformanceSnapshot {
  const trades = useBacktestStore((s) => s.trades);
  return computePerformanceSnapshot(trades);
}
