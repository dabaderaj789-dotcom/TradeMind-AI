/**
 * TradeMind V4 workspace — panels, widths, drawing tool, analysis fullscreen.
 * Presentation only; no trading-logic changes.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "../lib/endpoints";
import { DEFAULT_OVERLAYS, normalizeOverlays, type OverlayId } from "../lib/overlays";

export type LayoutId = "1" | "2v" | "2h" | "4" | "6" | "8";

export type DrawingToolId =
  | "cursor"
  | "crosshair"
  | "hline"
  | "trendline"
  | "ray"
  | "rect"
  | "fib"
  | "text"
  | "measure"
  | "eraser";

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
  analysisFullscreen: boolean;
  watchlistWidth: number;
  aiPanelWidth: number;
  drawingTool: DrawingToolId;
  setLayout: (layout: LayoutId) => void;
  setActivePane: (id: string) => void;
  setPaneSymbol: (paneId: string, symbolId: string) => void;
  setPaneTimeframe: (paneId: string, tf: Timeframe) => void;
  setPaneOverlay: (paneId: string, overlayId: OverlayId, on: boolean) => void;
  syncPrimarySymbol: (symbolId: string) => void;
  setAiPanelOpen: (open: boolean) => void;
  toggleAiPanel: () => void;
  setWatchlistOpen: (open: boolean) => void;
  toggleWatchlist: () => void;
  setBottomOpen: (open: boolean) => void;
  setFullscreen: (on: boolean) => void;
  toggleFullscreen: () => void;
  setAnalysisFullscreen: (on: boolean) => void;
  setWatchlistWidth: (w: number) => void;
  setAiPanelWidth: (w: number) => void;
  setDrawingTool: (tool: DrawingToolId) => void;
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

function makePane(id: string, symbolId = "", timeframe: Timeframe = "15m"): ChartPaneState {
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
    next.push(makePane(`pane-${next.length + 1}-${Date.now()}`, seed, next[0]?.timeframe ?? "15m"));
  }
  return next;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      layout: "1",
      panes: [makePane("pane-1")],
      activePaneId: "pane-1",
      aiPanelOpen: true,
      watchlistOpen: true,
      bottomOpen: false,
      fullscreen: false,
      analysisFullscreen: false,
      watchlistWidth: 248,
      aiPanelWidth: 340,
      drawingTool: "cursor",
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
        set({
          panes: s.panes.map((p) => (p.id === s.activePaneId ? { ...p, symbolId } : p)),
        });
      },
      setAiPanelOpen: (open) => set({ aiPanelOpen: open, analysisFullscreen: open ? get().analysisFullscreen : false }),
      toggleAiPanel: () =>
        set((s) => ({
          aiPanelOpen: !s.aiPanelOpen,
          analysisFullscreen: !s.aiPanelOpen ? s.analysisFullscreen : false,
        })),
      setWatchlistOpen: (open) => set({ watchlistOpen: open }),
      toggleWatchlist: () => set((s) => ({ watchlistOpen: !s.watchlistOpen })),
      setBottomOpen: (open) => set({ bottomOpen: open }),
      setFullscreen: (on) => set({ fullscreen: on, analysisFullscreen: on ? false : get().analysisFullscreen }),
      toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen, analysisFullscreen: false })),
      setAnalysisFullscreen: (on) =>
        set({
          analysisFullscreen: on,
          aiPanelOpen: on ? true : get().aiPanelOpen,
          fullscreen: on ? false : get().fullscreen,
        }),
      setWatchlistWidth: (w) => set({ watchlistWidth: clamp(w, 180, 420) }),
      setAiPanelWidth: (w) => set({ aiPanelWidth: clamp(w, 280, 560) }),
      setDrawingTool: (tool) => set({ drawingTool: tool }),
    }),
    {
      name: "trademind.workspace",
      version: 5,
      partialize: (s) => ({
        layout: s.layout,
        panes: s.panes,
        activePaneId: s.activePaneId,
        aiPanelOpen: s.aiPanelOpen,
        watchlistOpen: s.watchlistOpen,
        watchlistWidth: s.watchlistWidth,
        aiPanelWidth: s.aiPanelWidth,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<WorkspaceState>;
        const panes = (p.panes ?? [makePane("pane-1")]).map((pane) => ({
          ...pane,
          timeframe: (["1m", "5m", "15m"].includes(pane.timeframe) ? pane.timeframe : "15m") as Timeframe,
          overlays: normalizeOverlays(pane.overlays as Partial<Record<string, boolean>>),
        }));
        return {
          ...p,
          panes,
          layout: "1",
          activePaneId: p.activePaneId ?? panes[0]?.id ?? "pane-1",
          aiPanelOpen: p.aiPanelOpen ?? true,
          watchlistOpen: p.watchlistOpen ?? true,
          watchlistWidth: p.watchlistWidth ?? 248,
          aiPanelWidth: p.aiPanelWidth ?? 340,
          drawingTool: "cursor",
          analysisFullscreen: false,
          fullscreen: false,
          bottomOpen: false,
        } as WorkspaceState;
      },
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
