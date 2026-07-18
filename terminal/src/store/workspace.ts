/**
 * Multi-chart workspace state — independent symbol/TF/overlays per pane.
 * No trading logic; visualization layout only.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "../lib/endpoints";
import { DEFAULT_OVERLAYS, type OverlayId } from "../lib/overlays";

export type LayoutId = "1" | "2v" | "2h" | "4" | "6" | "8";

export interface ChartPaneState {
  id: string;
  symbolId: string;
  timeframe: Timeframe;
  overlays: Record<OverlayId, boolean>;
}

interface WorkspaceState {
  layout: LayoutId;
  panes: ChartPaneState[];
  activePaneId: string;
  aiPanelOpen: boolean;
  watchlistOpen: boolean;
  bottomOpen: boolean;
  fullscreen: boolean;
  setLayout: (layout: LayoutId) => void;
  setActivePane: (id: string) => void;
  setPaneSymbol: (paneId: string, symbolId: string) => void;
  setPaneTimeframe: (paneId: string, tf: Timeframe) => void;
  setPaneOverlay: (paneId: string, overlayId: OverlayId, on: boolean) => void;
  syncPrimarySymbol: (symbolId: string) => void;
  setAiPanelOpen: (open: boolean) => void;
  setWatchlistOpen: (open: boolean) => void;
  setBottomOpen: (open: boolean) => void;
  setFullscreen: (on: boolean) => void;
  toggleFullscreen: () => void;
}

const LAYOUT_COUNTS: Record<LayoutId, number> = {
  "1": 1,
  "2v": 2,
  "2h": 2,
  "4": 4,
  "6": 6,
  "8": 8,
};

export const LAYOUT_OPTIONS: { id: LayoutId; label: string; short: string }[] = [
  { id: "1", label: "Single", short: "1" },
  { id: "2v", label: "2 Vertical", short: "2V" },
  { id: "2h", label: "2 Horizontal", short: "2H" },
  { id: "4", label: "4 Charts", short: "4" },
  { id: "6", label: "6 Charts", short: "6" },
  { id: "8", label: "8 Charts", short: "8" },
];

function makePane(id: string, symbolId = "", timeframe: Timeframe = "1h"): ChartPaneState {
  return {
    id,
    symbolId,
    timeframe,
    overlays: { ...DEFAULT_OVERLAYS },
  };
}

function resizePanes(panes: ChartPaneState[], count: number, fillSymbol: string): ChartPaneState[] {
  const next = panes.slice(0, count).map((p) => ({ ...p, overlays: { ...p.overlays } }));
  while (next.length < count) {
    const seed = next[0]?.symbolId || fillSymbol;
    next.push(makePane(`pane-${next.length + 1}-${Date.now()}`, seed, next[0]?.timeframe ?? "1h"));
  }
  return next;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      layout: "1",
      panes: [makePane("pane-1")],
      activePaneId: "pane-1",
      aiPanelOpen: true,
      watchlistOpen: false,
      bottomOpen: false,
      fullscreen: false,
      setLayout: (layout) =>
        set((s) => {
          const panes = resizePanes(s.panes, LAYOUT_COUNTS[layout], s.panes[0]?.symbolId ?? "");
          const activePaneId = panes.some((p) => p.id === s.activePaneId)
            ? s.activePaneId
            : panes[0].id;
          return { layout, panes, activePaneId };
        }),
      setActivePane: (id) => set({ activePaneId: id }),
      setPaneSymbol: (paneId, symbolId) =>
        set((s) => ({
          panes: s.panes.map((p) => (p.id === paneId ? { ...p, symbolId } : p)),
        })),
      setPaneTimeframe: (paneId, tf) =>
        set((s) => ({
          panes: s.panes.map((p) => (p.id === paneId ? { ...p, timeframe: tf } : p)),
        })),
      setPaneOverlay: (paneId, overlayId, on) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === paneId ? { ...p, overlays: { ...p.overlays, [overlayId]: on } } : p,
          ),
        })),
      syncPrimarySymbol: (symbolId) => {
        const s = get();
        if (!symbolId) return;
        if (s.layout === "1") {
          set({
            panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbolId } : p)),
            activePaneId: s.panes[0]?.id ?? "pane-1",
          });
          return;
        }
        // Keep active pane on the navigated symbol when multi-chart.
        set({
          panes: s.panes.map((p) => (p.id === s.activePaneId ? { ...p, symbolId } : p)),
        });
      },
      setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
      setWatchlistOpen: (open) => set({ watchlistOpen: open }),
      setBottomOpen: (open) => set({ bottomOpen: open }),
      setFullscreen: (on) => set({ fullscreen: on }),
      toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),
    }),
    {
      name: "trademind.workspace",
      version: 2,
      partialize: (s) => ({
        layout: s.layout,
        panes: s.panes,
        activePaneId: s.activePaneId,
        aiPanelOpen: s.aiPanelOpen,
        watchlistOpen: s.watchlistOpen,
      }),
    },
  ),
);

export function layoutGridClass(layout: LayoutId): string {
  switch (layout) {
    case "1":
      return "grid-cols-1 grid-rows-1";
    case "2v":
      return "grid-cols-2 grid-rows-1";
    case "2h":
      return "grid-cols-1 grid-rows-2";
    case "4":
      return "grid-cols-2 grid-rows-2";
    case "6":
      return "grid-cols-3 grid-rows-2";
    case "8":
      return "grid-cols-4 grid-rows-2";
    default:
      return "grid-cols-1 grid-rows-1";
  }
}
