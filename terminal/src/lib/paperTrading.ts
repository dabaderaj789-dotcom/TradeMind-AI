/**
 * Paper trading — hypothetical fills only. No broker orders.
 * Entry at signal/trigger price + slippage assumption. No perfect fills between ticks.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiDecision } from "./decision";
import type { DecisionProfileId } from "./decisionProfiles";
import { levelsFromDecision } from "./decisionLevels";

/** Points of adverse slippage assumed on fill (honest, not zero). */
export const PAPER_SLIPPAGE_POINTS = 0.5;

export interface PaperTrade {
  id: string;
  day: string;
  openedAt: string;
  closedAt: string | null;
  symbolId: string;
  symbolCode: string;
  timeframe: string;
  profile: DecisionProfileId;
  side: "BUY" | "SELL";
  setupLevel: "early" | "confirmed" | null;
  /** Theoretical trigger / signal price before slippage. */
  signalPrice: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  rr: number | null;
  confidence: number;
  exit: number | null;
  exitReason: "tp1" | "tp2" | "sl" | "manual" | "eod" | null;
  pnlPoints: number | null;
  mfe: number;
  mae: number;
  holdingTimeMs: number | null;
  slippagePoints: number;
  status: "open" | "closed";
}

export interface PaperDayStats {
  day: string;
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgWin: number;
  avgLoss: number;
  expectancy: number | null;
  profitFactor: number | null;
  avgMfe: number;
  avgMae: number;
  avgRr: number | null;
  avgHoldingMin: number | null;
  maxDrawdownPoints: number;
  earlyWins: number;
  earlyLosses: number;
  confirmedWins: number;
  confirmedLosses: number;
  disclaimer: string;
}

interface PaperState {
  enabled: boolean;
  trades: PaperTrade[];
  setEnabled: (on: boolean) => void;
  openFromDecision: (opts: {
    symbolId: string;
    symbolCode: string;
    timeframe: string;
    profile: DecisionProfileId;
    decision: AiDecision;
    /** Last traded / tip price at signal time when available. */
    lastPrice?: number | null;
  }) => void;
  onPrice: (symbolId: string, timeframe: string, price: number) => void;
  dayStats: (day?: string) => PaperDayStats;
  clear: () => void;
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const usePaperTrading = create<PaperState>()(
  persist(
    (set, get) => ({
      enabled: false,
      trades: [],

      setEnabled: (on) => set({ enabled: on }),

      openFromDecision: ({ symbolId, symbolCode, timeframe, profile, decision, lastPrice }) => {
        if (!get().enabled) return;
        if (!decision.actionable) return;
        const lv = levelsFromDecision(decision);
        if (!lv || lv.rr == null || lv.rr + 1e-9 < 2) return; // do not paper a sub-2R invented trade
        const side: "BUY" | "SELL" = decision.direction === "buy" ? "BUY" : "SELL";
        const id = `${symbolId}:${timeframe}:${side}:${decision.setup?.setup_id ?? lv.entry}:${dayKey()}`;
        if (
          get().trades.some(
            (t) =>
              t.id === id ||
              (t.status === "open" && t.symbolId === symbolId && t.timeframe === timeframe),
          )
        ) {
          return;
        }

        // Fill at signal/trigger: prefer lastPrice if it has crossed entry, else entry ± slip
        const signalPrice =
          lastPrice != null && lastPrice > 0
            ? lastPrice
            : lv.entry;
        const slip = PAPER_SLIPPAGE_POINTS;
        const entry =
          side === "BUY" ? signalPrice + slip : signalPrice - slip;

        const trade: PaperTrade = {
          id,
          day: dayKey(),
          openedAt: new Date().toISOString(),
          closedAt: null,
          symbolId,
          symbolCode,
          timeframe,
          profile,
          side,
          setupLevel: decision.intraday?.setupLevel ?? null,
          signalPrice,
          entry,
          stop: lv.stop,
          tp1: lv.tp1,
          tp2: lv.tp2,
          rr: Math.abs(lv.tp1 - entry) / Math.abs(entry - lv.stop),
          confidence: decision.confidence,
          exit: null,
          exitReason: null,
          pnlPoints: null,
          mfe: 0,
          mae: 0,
          holdingTimeMs: null,
          slippagePoints: slip,
          status: "open",
        };
        set((s) => ({ trades: [trade, ...s.trades].slice(0, 500) }));
      },

      onPrice: (symbolId, timeframe, price) => {
        if (!(price > 0)) return;
        set((s) => ({
          trades: s.trades.map((t) => {
            if (t.status !== "open" || t.symbolId !== symbolId || t.timeframe !== timeframe) return t;
            let mfe = t.mfe;
            let mae = t.mae;
            const hold = Date.now() - Date.parse(t.openedAt);
            if (t.side === "BUY") {
              mfe = Math.max(mfe, price - t.entry);
              mae = Math.max(mae, t.entry - price);
              if (price <= t.stop) {
                return {
                  ...t,
                  status: "closed" as const,
                  closedAt: new Date().toISOString(),
                  exit: price,
                  exitReason: "sl" as const,
                  pnlPoints: Math.round((price - t.entry) * 100) / 100,
                  mfe,
                  mae,
                  holdingTimeMs: hold,
                };
              }
              if (t.tp2 != null && price >= t.tp2) {
                return {
                  ...t,
                  status: "closed" as const,
                  closedAt: new Date().toISOString(),
                  exit: price,
                  exitReason: "tp2" as const,
                  pnlPoints: Math.round((price - t.entry) * 100) / 100,
                  mfe,
                  mae,
                  holdingTimeMs: hold,
                };
              }
              if (price >= t.tp1) {
                return {
                  ...t,
                  status: "closed" as const,
                  closedAt: new Date().toISOString(),
                  exit: price,
                  exitReason: "tp1" as const,
                  pnlPoints: Math.round((price - t.entry) * 100) / 100,
                  mfe,
                  mae,
                  holdingTimeMs: hold,
                };
              }
            } else {
              mfe = Math.max(mfe, t.entry - price);
              mae = Math.max(mae, price - t.entry);
              if (price >= t.stop) {
                return {
                  ...t,
                  status: "closed" as const,
                  closedAt: new Date().toISOString(),
                  exit: price,
                  exitReason: "sl" as const,
                  pnlPoints: Math.round((t.entry - price) * 100) / 100,
                  mfe,
                  mae,
                  holdingTimeMs: hold,
                };
              }
              if (t.tp2 != null && price <= t.tp2) {
                return {
                  ...t,
                  status: "closed" as const,
                  closedAt: new Date().toISOString(),
                  exit: price,
                  exitReason: "tp2" as const,
                  pnlPoints: Math.round((t.entry - price) * 100) / 100,
                  mfe,
                  mae,
                  holdingTimeMs: hold,
                };
              }
              if (price <= t.tp1) {
                return {
                  ...t,
                  status: "closed" as const,
                  closedAt: new Date().toISOString(),
                  exit: price,
                  exitReason: "tp1" as const,
                  pnlPoints: Math.round((t.entry - price) * 100) / 100,
                  mfe,
                  mae,
                  holdingTimeMs: hold,
                };
              }
            }
            return { ...t, mfe, mae, holdingTimeMs: hold };
          }),
        }));
      },

      dayStats: (day) => {
        const d = day ?? dayKey();
        const closed = get().trades.filter((t) => t.day === d && t.status === "closed");
        const wins = closed.filter((t) => (t.pnlPoints ?? 0) > 0);
        const losses = closed.filter((t) => (t.pnlPoints ?? 0) <= 0);
        const avgWin = wins.length
          ? wins.reduce((a, t) => a + (t.pnlPoints ?? 0), 0) / wins.length
          : 0;
        const avgLoss = losses.length
          ? losses.reduce((a, t) => a + (t.pnlPoints ?? 0), 0) / losses.length
          : 0;
        const grossWin = wins.reduce((a, t) => a + (t.pnlPoints ?? 0), 0);
        const grossLoss = Math.abs(losses.reduce((a, t) => a + (t.pnlPoints ?? 0), 0));
        const rrs = closed.map((t) => t.rr).filter((x): x is number => x != null);
        const holds = closed
          .map((t) => t.holdingTimeMs)
          .filter((x): x is number => x != null);
        // Max drawdown from cumulative paper PnL path
        let peak = 0;
        let equity = 0;
        let maxDd = 0;
        for (const t of [...closed].reverse()) {
          equity += t.pnlPoints ?? 0;
          peak = Math.max(peak, equity);
          maxDd = Math.max(maxDd, peak - equity);
        }
        const early = closed.filter((t) => t.setupLevel === "early");
        const conf = closed.filter((t) => t.setupLevel === "confirmed");
        return {
          day: d,
          sampleSize: closed.length,
          wins: wins.length,
          losses: losses.length,
          winRate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : null,
          avgWin: Math.round(avgWin * 100) / 100,
          avgLoss: Math.round(avgLoss * 100) / 100,
          expectancy:
            closed.length > 0
              ? Math.round(
                  ((grossWin + losses.reduce((a, t) => a + (t.pnlPoints ?? 0), 0)) / closed.length) *
                    100,
                ) / 100
              : null,
          profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
          avgMfe:
            closed.length > 0
              ? Math.round((closed.reduce((a, t) => a + t.mfe, 0) / closed.length) * 100) / 100
              : 0,
          avgMae:
            closed.length > 0
              ? Math.round((closed.reduce((a, t) => a + t.mae, 0) / closed.length) * 100) / 100
              : 0,
          avgRr: rrs.length ? Math.round((rrs.reduce((a, b) => a + b, 0) / rrs.length) * 100) / 100 : null,
          avgHoldingMin: holds.length
            ? Math.round((holds.reduce((a, b) => a + b, 0) / holds.length / 60_000) * 10) / 10
            : null,
          maxDrawdownPoints: Math.round(maxDd * 100) / 100,
          earlyWins: early.filter((t) => (t.pnlPoints ?? 0) > 0).length,
          earlyLosses: early.filter((t) => (t.pnlPoints ?? 0) <= 0).length,
          confirmedWins: conf.filter((t) => (t.pnlPoints ?? 0) > 0).length,
          confirmedLosses: conf.filter((t) => (t.pnlPoints ?? 0) <= 0).length,
          disclaimer:
            `Paper / observed only (+${PAPER_SLIPPAGE_POINTS}pt slip). Not live P&L. n=${closed.length} — insufficient until multi-session.`,
        };
      },

      clear: () => set({ trades: [] }),
    }),
    { name: "trademind.paperTrading.v2" },
  ),
);
