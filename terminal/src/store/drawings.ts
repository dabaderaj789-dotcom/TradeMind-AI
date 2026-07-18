/**
 * User chart drawings — presentation only (not SMC / decision logic).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DrawingToolId } from "./workspace";

export type ChartDrawing =
  | { id: string; kind: "hline"; price: number; color: string; label?: string }
  | {
      id: string;
      kind: "trendline" | "ray";
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
  | { id: string; kind: "text"; t: number; p: number; text: string; color: string };

interface DrawingsState {
  bySymbol: Record<string, ChartDrawing[]>;
  draft: { tool: DrawingToolId; a?: { t: number; p: number } } | null;
  add: (symbolId: string, d: ChartDrawing) => void;
  remove: (symbolId: string, id: string) => void;
  clear: (symbolId: string) => void;
  setDraft: (d: DrawingsState["draft"]) => void;
  removeNearest: (symbolId: string, price: number, time: number) => void;
}

function uid() {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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
      removeNearest: (symbolId, price, time) => {
        const list = get().bySymbol[symbolId] ?? [];
        if (!list.length) return;
        let best = list[0];
        let bestScore = Infinity;
        for (const d of list) {
          let score = Infinity;
          if (d.kind === "hline") score = Math.abs(d.price - price);
          else if (d.kind === "text") score = Math.abs(d.p - price) + Math.abs(d.t - time) * 0.0001;
          else score = Math.abs(d.p1 - price) + Math.abs(d.p2 - price);
          if (score < bestScore) {
            bestScore = score;
            best = d;
          }
        }
        if (best) get().remove(symbolId, best.id);
      },
    }),
    {
      name: "trademind.drawings.v4",
      partialize: (s) => ({ bySymbol: s.bySymbol }),
    },
  ),
);

export { uid as drawingId };
