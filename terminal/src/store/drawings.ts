/**
 * User chart drawings — presentation only (not SMC / decision logic).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DrawingToolId } from "./workspace";

export type ChartDrawing =
  | { id: string; kind: "hline"; price: number; color: string; label?: string }
  | { id: string; kind: "vline"; time: number; color: string }
  | {
      id: string;
      kind: "trendline" | "ray" | "arrow";
      t1: number;
      p1: number;
      t2: number;
      p2: number;
      color: string;
    }
  | {
      id: string;
      kind: "rect";
      t1: number;
      p1: number;
      t2: number;
      p2: number;
      color: string;
    }
  | {
      id: string;
      kind: "fib";
      t1: number;
      p1: number;
      t2: number;
      p2: number;
      color: string;
    }
  | {
      id: string;
      kind: "brush";
      points: Array<{ t: number; p: number }>;
      color: string;
    }
  | { id: string; kind: "text"; t: number; p: number; text: string; color: string }
  | {
      id: string;
      kind: "position";
      side: "long" | "short";
      t1: number;
      p1: number;
      t2: number;
      p2: number;
      color: string;
    };

interface DrawingsState {
  bySymbol: Record<string, ChartDrawing[]>;
  draft: { tool: DrawingToolId; a?: { t: number; p: number }; points?: Array<{ t: number; p: number }> } | null;
  add: (symbolId: string, d: ChartDrawing) => void;
  update: (symbolId: string, id: string, d: ChartDrawing) => void;
  remove: (symbolId: string, id: string) => void;
  clear: (symbolId: string) => void;
  setDraft: (d: DrawingsState["draft"]) => void;
  removeNearest: (symbolId: string, price: number, time: number) => void;
  findNearest: (symbolId: string, price: number, time: number) => ChartDrawing | null;
}

function uid() {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function nearestScore(d: ChartDrawing, price: number, time: number): number {
  if (d.kind === "hline") return Math.abs(d.price - price);
  if (d.kind === "vline") return Math.abs(d.time - time) * 0.0001;
  if (d.kind === "text") return Math.abs(d.p - price) + Math.abs(d.t - time) * 0.0001;
  if (d.kind === "brush") {
    return Math.min(...d.points.map((pt) => Math.abs(pt.p - price) + Math.abs(pt.t - time) * 0.0001));
  }
  return (
    Math.min(Math.abs(d.p1 - price), Math.abs(d.p2 - price)) +
    Math.min(Math.abs(d.t1 - time), Math.abs(d.t2 - time)) * 0.00005
  );
}

export const useDrawings = create<DrawingsState>()(
  persist(
    (set, get) => ({
      bySymbol: {},
      draft: null,
      add: (symbolId, d) =>
        set((s) => ({
          bySymbol: {
            ...s.bySymbol,
            [symbolId]: [...(s.bySymbol[symbolId] ?? []), d],
          },
        })),
      update: (symbolId, id, d) =>
        set((s) => ({
          bySymbol: {
            ...s.bySymbol,
            [symbolId]: (s.bySymbol[symbolId] ?? []).map((x) => (x.id === id ? d : x)),
          },
        })),
      remove: (symbolId, id) =>
        set((s) => ({
          bySymbol: {
            ...s.bySymbol,
            [symbolId]: (s.bySymbol[symbolId] ?? []).filter((x) => x.id !== id),
          },
        })),
      clear: (symbolId) =>
        set((s) => ({
          bySymbol: { ...s.bySymbol, [symbolId]: [] },
        })),
      setDraft: (draft) => set({ draft }),
      findNearest: (symbolId, price, time) => {
        const list = get().bySymbol[symbolId] ?? [];
        if (!list.length) return null;
        let best = list[0];
        let bestScore = Infinity;
        for (const d of list) {
          const score = nearestScore(d, price, time);
          if (score < bestScore) {
            bestScore = score;
            best = d;
          }
        }
        return best;
      },
      removeNearest: (symbolId, price, time) => {
        const best = get().findNearest(symbolId, price, time);
        if (best) get().remove(symbolId, best.id);
      },
    }),
    {
      name: "trademind.drawings.v5",
      partialize: (s) => ({ bySymbol: s.bySymbol }),
    },
  ),
);

/** Translate a drawing by Δtime / Δprice (TradingView-style move). */
export function translateDrawing(d: ChartDrawing, dt: number, dp: number): ChartDrawing {
  switch (d.kind) {
    case "hline":
      return { ...d, price: d.price + dp };
    case "vline":
      return { ...d, time: d.time + dt };
    case "text":
      return { ...d, t: d.t + dt, p: d.p + dp };
    case "brush":
      return {
        ...d,
        points: d.points.map((pt) => ({ t: pt.t + dt, p: pt.p + dp })),
      };
    default:
      return {
        ...d,
        t1: d.t1 + dt,
        p1: d.p1 + dp,
        t2: d.t2 + dt,
        p2: d.p2 + dp,
      };
  }
}

export { uid as drawingId };
