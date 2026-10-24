/**
 * TradeMind V8 — Personality learning store.
 *
 * After session close (or on resolve), compare detected personality vs what
 * price actually did. Accumulate win rates over hundreds of sessions so
 * thresholds can later adapt from evidence instead of fixed knobs.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MarketPersonality, MarketPersonalityId, PersonalityBias } from "./marketPersonality";

export type PersonalityOutcome = "followed" | "failed" | "choppy" | "unknown";

export interface PersonalitySnapshot {
  id: string;
  day: string;
  symbolId: string;
  symbolCode: string;
  timeframe: string;
  createdAt: string;
  resolvedAt: string | null;
  personalityId: MarketPersonalityId;
  label: string;
  bias: PersonalityBias;
  strength: number;
  confidence: number;
  preferredAction: "buy" | "sell" | "wait";
  characteristics: string[];
  priceAtDetect: number;
  /** Forward move in preferred direction (points). */
  forwardPoints: number | null;
  outcome: PersonalityOutcome;
  /** Did AI take a trade aligned with personality? */
  tradeAligned: boolean | null;
  tradeWon: boolean | null;
}

export interface PersonalityStats {
  personalityId: MarketPersonalityId;
  label: string;
  samples: number;
  followed: number;
  failed: number;
  choppy: number;
  /** 0–100 empirical follow-through rate when action ≠ wait. */
  followThroughRate: number;
  avgForwardPoints: number;
  tradesTaken: number;
  tradeWins: number;
  tradeWinRate: number;
  /** Suggested earlyBias adjustment from evidence (−0.5..+0.5). */
  learnedEarlyBias: number;
}

interface PersonalityLearningState {
  snapshots: PersonalitySnapshot[];
  recordLive: (opts: {
    symbolId: string;
    symbolCode: string;
    timeframe: string;
    personality: MarketPersonality;
    price: number;
    tradeAligned?: boolean | null;
  }) => void;
  markTradeResult: (symbolId: string, timeframe: string, won: boolean) => void;
  evaluateForward: (symbolId: string, timeframe: string, price: number) => void;
  /** End-of-day resolve remaining open snapshots. */
  closeSession: (symbolId: string, timeframe: string, closePrice: number) => void;
  stats: () => PersonalityStats[];
  bestPersonalities: (minSamples?: number) => PersonalityStats[];
  clear: () => void;
}

function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeStats(snapshots: PersonalitySnapshot[]): PersonalityStats[] {
  const byId = new Map<string, PersonalitySnapshot[]>();
  for (const s of snapshots) {
    if (!s.resolvedAt) continue;
    const list = byId.get(s.personalityId) ?? [];
    list.push(s);
    byId.set(s.personalityId, list);
  }
  const out: PersonalityStats[] = [];
  for (const [pid, list] of byId) {
    const followed = list.filter((x) => x.outcome === "followed").length;
    const failed = list.filter((x) => x.outcome === "failed").length;
    const choppy = list.filter((x) => x.outcome === "choppy").length;
    const actionable = list.filter((x) => x.preferredAction !== "wait");
    const followThroughRate =
      actionable.length > 0 ? Math.round((followed / actionable.length) * 100) : 0;
    const pts = list.filter((x) => x.forwardPoints != null).map((x) => x.forwardPoints!);
    const avgForwardPoints = pts.length
      ? Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 100) / 100
      : 0;
    const trades = list.filter((x) => x.tradeAligned === true);
    const wins = trades.filter((x) => x.tradeWon === true).length;
    const tradeWinRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
    // Learn: boost early bias when follow-through is high
    let learnedEarlyBias = 0;
    if (actionable.length >= 8) {
      if (followThroughRate >= 62) learnedEarlyBias = Math.min(0.5, (followThroughRate - 50) / 80);
      else if (followThroughRate <= 40) learnedEarlyBias = Math.max(-0.5, (followThroughRate - 50) / 80);
    }
    out.push({
      personalityId: pid as MarketPersonalityId,
      label: list[0]?.label ?? pid,
      samples: list.length,
      followed,
      failed,
      choppy,
      followThroughRate,
      avgForwardPoints,
      tradesTaken: trades.length,
      tradeWins: wins,
      tradeWinRate,
      learnedEarlyBias,
    });
  }
  return out.sort((a, b) => b.followThroughRate - a.followThroughRate || b.samples - a.samples);
}

export const usePersonalityLearning = create<PersonalityLearningState>()(
  persist(
    (set, get) => ({
      snapshots: [],

      recordLive: ({ symbolId, symbolCode, timeframe, personality, price, tradeAligned }) => {
        if (!(price > 0)) return;
        const id = `${symbolId}:${timeframe}:${personality.id}:${dayKey()}`;
        const existing = get().snapshots.find((s) => s.id === id && !s.resolvedAt);
        if (existing) {
          // Refresh live fields on same personality day-bucket
          set((st) => ({
            snapshots: st.snapshots.map((s) =>
              s.id === id && !s.resolvedAt
                ? {
                    ...s,
                    strength: personality.strength,
                    confidence: personality.confidence,
                    characteristics: personality.characteristics,
                    tradeAligned: tradeAligned ?? s.tradeAligned,
                  }
                : s,
            ),
          }));
          return;
        }
        // Throttle new personality changes — one open per symbol/tf
        const open = get().snapshots.find(
          (s) => s.symbolId === symbolId && s.timeframe === timeframe && !s.resolvedAt,
        );
        if (open && open.personalityId === personality.id) return;
        // Resolve prior open if personality flipped
        if (open && open.personalityId !== personality.id) {
          get().evaluateForward(symbolId, timeframe, price);
        }

        const snap: PersonalitySnapshot = {
          id,
          day: dayKey(),
          symbolId,
          symbolCode,
          timeframe,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          personalityId: personality.id,
          label: personality.label,
          bias: personality.bias,
          strength: personality.strength,
          confidence: personality.confidence,
          preferredAction: personality.preferredAction,
          characteristics: personality.characteristics,
          priceAtDetect: price,
          forwardPoints: null,
          outcome: "unknown",
          tradeAligned: tradeAligned ?? null,
          tradeWon: null,
        };
        set((st) => ({ snapshots: [snap, ...st.snapshots].slice(0, 2000) }));
      },

      markTradeResult: (symbolId, timeframe, won) => {
        set((st) => ({
          snapshots: st.snapshots.map((s) =>
            s.symbolId === symbolId && s.timeframe === timeframe && s.tradeAligned && s.tradeWon == null
              ? { ...s, tradeWon: won }
              : s,
          ),
        }));
      },

      evaluateForward: (symbolId, timeframe, price) => {
        if (!(price > 0)) return;
        set((st) => {
          const next = st.snapshots.map((s) => {
            if (s.symbolId !== symbolId || s.timeframe !== timeframe || s.resolvedAt) return s;
            const ageMin = (Date.now() - Date.parse(s.createdAt)) / 60_000;
            if (ageMin < 5) return s;

            const move = price - s.priceAtDetect;
            const thresh = Math.max(s.priceAtDetect * 0.0012, 6);
            let forwardPoints = 0;
            let outcome: PersonalityOutcome = "choppy";

            if (s.preferredAction === "sell") {
              forwardPoints = -move;
              if (forwardPoints >= thresh) outcome = "followed";
              else if (forwardPoints <= -thresh) outcome = "failed";
              else outcome = "choppy";
            } else if (s.preferredAction === "buy") {
              forwardPoints = move;
              if (forwardPoints >= thresh) outcome = "followed";
              else if (forwardPoints <= -thresh) outcome = "failed";
              else outcome = "choppy";
            } else {
              // WAIT personalities succeed if range stays contained
              if (Math.abs(move) < thresh) outcome = "followed";
              else outcome = Math.abs(move) > thresh * 2 ? "failed" : "choppy";
              forwardPoints = Math.abs(move);
            }

            if (ageMin < 25 && outcome === "choppy") return s;

            return {
              ...s,
              resolvedAt: new Date().toISOString(),
              forwardPoints: Math.round(forwardPoints * 100) / 100,
              outcome,
            };
          });
          return { snapshots: next };
        });
      },

      closeSession: (symbolId, timeframe, closePrice) => {
        get().evaluateForward(symbolId, timeframe, closePrice);
        set((st) => ({
          snapshots: st.snapshots.map((s) =>
            s.symbolId === symbolId && s.timeframe === timeframe && !s.resolvedAt
              ? {
                  ...s,
                  resolvedAt: new Date().toISOString(),
                  forwardPoints: Math.round(Math.abs(closePrice - s.priceAtDetect) * 100) / 100,
                  outcome: s.outcome === "unknown" ? "choppy" : s.outcome,
                }
              : s,
          ),
        }));
      },

      stats: () => computeStats(get().snapshots),
      bestPersonalities: (minSamples = 5) =>
        computeStats(get().snapshots).filter((s) => s.samples >= minSamples),
      clear: () => set({ snapshots: [] }),
    }),
    { name: "trademind.personalityLearning.v1" },
  ),
);

/** Apply learned early-bias nudge onto a live personality (non-destructive copy). */
export function applyLearnedBias(
  personality: MarketPersonality,
  stats: PersonalityStats[],
): MarketPersonality {
  const row = stats.find((s) => s.personalityId === personality.id);
  if (!row || row.samples < 8) return personality;
  return {
    ...personality,
    earlyBias: Math.max(-0.6, Math.min(0.6, personality.earlyBias + row.learnedEarlyBias)),
    characteristics:
      row.samples >= 12
        ? [
            ...personality.characteristics,
            `Evidence: ${row.followThroughRate}% follow-through over ${row.samples} sessions`,
          ]
        : personality.characteristics,
  };
}
