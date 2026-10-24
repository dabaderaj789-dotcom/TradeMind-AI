/**
 * TradeMind V5 workspace — panels, multi-chart, drawing chrome, named desks.
 * Presentation only; no trading-logic changes.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "../lib/endpoints";
import { DEFAULT_OVERLAYS, normalizeOverlays, type OverlayId } from "../lib/overlays";

/** Visual multi-chart layouts (Angel One / TradingView–style). */
export type LayoutId =
  | "1"
  | "2v"
  | "2h"
  | "3v"
  | "3h"
  | "3l"
  | "3t"
  | "4"
  | "4v"
  | "4h"
  | "4l"
  | "6"
  | "6h"
  | "8";

export type AiPanelMode = "full" | "strip" | "hidden";

/** Right dock / primary workspace surfaces (Angel One TradeOne IA). */
export type RightPanelTab =
  | "watchlist"
  | "options"
  | "ai"
  | "journal"
  | "depth"
  | "orders"
  | "positions"
  | "portfolio"
  | "alerts"
  | "ticket";

/** Center workspace mode — Chart stays default; others overlay/replace main pane. */
export type DeskWorkspace =
  | "chart"
  | "overview"
  | "options"
  | "orders"
  | "positions"
  | "portfolio"
  | "ai"
  | "journal"
  | "alerts"
  | "depth"
  | "markets";

export type ChartTypeId = "candles" | "bars" | "line" | "area" | "heikin";

export type BottomWorkspaceTab =
  | "options"
  | "orders"
  | "positions"
  | "ticket"
  | "portfolio"
  | "depth"
  | "journal"
  | "alerts"
  | "analysis";

export type NamedWorkspaceId = "default" | "intraday" | "expiry" | "options" | "custom";

export type DrawingToolId =
  | "cursor"
  | "crosshair"
  | "hline"
  | "vline"
  | "trendline"
  | "ray"
  | "rect"
  | "arrow"
  | "brush"
  | "fib"
  | "text"
  | "measure"
  | "eraser"
  | "long"
  | "short";

export interface ChartPaneState {
  id: string;
  symbolId: string;
  timeframe: Timeframe;
  overlays: Record<OverlayId, boolean>;
}

export interface NamedWorkspaceSnapshot {
  layout: LayoutId;
  panes: ChartPaneState[];
  activePaneId: string;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  chartType: ChartTypeId;
  aiPanelMode: AiPanelMode;
}

interface WorkspaceState {
  layout: LayoutId;
  panes: ChartPaneState[];
  activePaneId: string;
  aiPanelMode: AiPanelMode;
  watchlistOpen: boolean;
  bottomOpen: boolean;
  /** Analysis Mode — chart-first fullscreen */
  analysisMode: boolean;
  watchlistWidth: number;
  aiPanelWidth: number;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  rightPanelWidth: number;
  deskWorkspace: DeskWorkspace;
  symbolSearchOpen: boolean;
  chartType: ChartTypeId;
  bottomTab: BottomWorkspaceTab;
  bottomHeight: number;
  replayActive: boolean;
  replayIndex: number | null;
  namedWorkspaceId: NamedWorkspaceId;
  namedWorkspaces: Record<NamedWorkspaceId, NamedWorkspaceSnapshot | null>;
  drawingTool: DrawingToolId;
  magnet: boolean;
  drawingsLocked: boolean;
  drawingsHidden: boolean;
  setLayout: (layout: LayoutId) => void;
  setActivePane: (id: string) => void;
  setPaneSymbol: (paneId: string, symbolId: string) => void;
  setPaneTimeframe: (paneId: string, tf: Timeframe) => void;
  setPaneOverlay: (paneId: string, overlayId: OverlayId, on: boolean) => void;
  setPaneOverlays: (paneId: string, overlays: Record<OverlayId, boolean>) => void;
  syncPrimarySymbol: (symbolId: string) => void;
  setAiPanelMode: (mode: AiPanelMode) => void;
  cycleAiPanel: () => void;
  setWatchlistOpen: (open: boolean) => void;
  toggleWatchlist: () => void;
  setBottomOpen: (open: boolean) => void;
  toggleBottom: () => void;
  setBottomTab: (tab: BottomWorkspaceTab) => void;
  setBottomHeight: (h: number) => void;
  setAnalysisMode: (on: boolean) => void;
  toggleAnalysisMode: () => void;
  setWatchlistWidth: (w: number) => void;
  setAiPanelWidth: (w: number) => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  openRightPanel: (tab: RightPanelTab) => void;
  setRightPanelWidth: (w: number) => void;
  setDeskWorkspace: (ws: DeskWorkspace) => void;
  openDeskWorkspace: (ws: DeskWorkspace) => void;
  setSymbolSearchOpen: (open: boolean) => void;
  setChartType: (t: ChartTypeId) => void;
  setReplayActive: (on: boolean) => void;
  setReplayIndex: (i: number | null) => void;
  applyNamedWorkspace: (id: NamedWorkspaceId) => void;
  saveNamedWorkspace: (id: NamedWorkspaceId) => void;
  setDrawingTool: (tool: DrawingToolId) => void;
  setMagnet: (on: boolean) => void;
  toggleMagnet: () => void;
  setDrawingsLocked: (on: boolean) => void;
  toggleDrawingsLocked: () => void;
  setDrawingsHidden: (on: boolean) => void;
  toggleDrawingsHidden: () => void;
}

/** Pane cells for the layout icon (rows of column spans summing to equal width). */
export type LayoutIconCells = number[][];

export interface LayoutOption {
  id: LayoutId;
  count: number;
  label: string;
  /** Visual preview cells — each inner array is a row of equal-height cells */
  icon: LayoutIconCells;
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: "1", count: 1, label: "1 chart", icon: [[1]] },
  { id: "2v", count: 2, label: "2 side by side", icon: [[1, 1]] },
  { id: "2h", count: 2, label: "2 stacked", icon: [[1], [1]] },
  { id: "3v", count: 3, label: "3 columns", icon: [[1, 1, 1]] },
  { id: "3h", count: 3, label: "3 stacked", icon: [[1], [1], [1]] },
  { id: "3l", count: 3, label: "1 left + 2 right", icon: [[2, 1], [0, 1]] },
  { id: "3t", count: 3, label: "1 top + 2 bottom", icon: [[1], [1, 1]] },
  { id: "4", count: 4, label: "2×2 grid", icon: [[1, 1], [1, 1]] },
  { id: "4v", count: 4, label: "4 columns", icon: [[1, 1, 1, 1]] },
  { id: "4h", count: 4, label: "4 stacked", icon: [[1], [1], [1], [1]] },
  { id: "4l", count: 4, label: "1 left + 3 right", icon: [[3, 1], [0, 1], [0, 1]] },
  { id: "6", count: 6, label: "2×3 grid", icon: [[1, 1, 1], [1, 1, 1]] },
  { id: "6h", count: 6, label: "3×2 grid", icon: [[1, 1], [1, 1], [1, 1]] },
  { id: "8", count: 8, label: "2×4 grid", icon: [[1, 1, 1, 1], [1, 1, 1, 1]] },
];

/** Primary layout picks for the chart toolbar (1 / 2 / 4). */
export const PRIMARY_LAYOUTS: LayoutId[] = ["1", "2v", "4"];

const LAYOUT_COUNTS: Record<LayoutId, number> = Object.fromEntries(
  LAYOUT_OPTIONS.map((o) => [o.id, o.count]),
) as Record<LayoutId, number>;

/** Group options by pane count for the picker rows. */
export const LAYOUT_ROWS: { count: number; options: LayoutOption[] }[] = (() => {
  const map = new Map<number, LayoutOption[]>();
  for (const opt of LAYOUT_OPTIONS) {
    const list = map.get(opt.count) ?? [];
    list.push(opt);
    map.set(opt.count, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([count, options]) => ({ count, options }));
})();

export const NAMED_WORKSPACE_LABELS: Record<NamedWorkspaceId, string> = {
  default: "Default",
  intraday: "Intraday",
  expiry: "Expiry",
  options: "Options",
  custom: "Custom",
};

function makePane(id: string, symbolId = "", timeframe: Timeframe = "5m"): ChartPaneState {
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

function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === "string" && v in LAYOUT_COUNTS;
}

function snapshotFrom(s: {
  layout: LayoutId;
  panes: ChartPaneState[];
  activePaneId: string;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  chartType: ChartTypeId;
  aiPanelMode: AiPanelMode;
}): NamedWorkspaceSnapshot {
  return {
    layout: s.layout,
    panes: s.panes.map((p) => ({ ...p, overlays: { ...p.overlays } })),
    activePaneId: s.activePaneId,
    rightPanelOpen: s.rightPanelOpen,
    rightPanelTab: s.rightPanelTab,
    chartType: s.chartType,
    aiPanelMode: s.aiPanelMode,
  };
}

const EMPTY_NAMED: Record<NamedWorkspaceId, NamedWorkspaceSnapshot | null> = {
  default: null,
  intraday: null,
  expiry: null,
  options: null,
  custom: null,
};

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      layout: "1",
      panes: [makePane("pane-1")],
      activePaneId: "pane-1",
      aiPanelMode: "hidden",
      watchlistOpen: false,
      bottomOpen: false,
      analysisMode: false,
      watchlistWidth: 260,
      aiPanelWidth: 340,
      rightPanelOpen: false,
      rightPanelTab: "ai",
      rightPanelWidth: 340,
      deskWorkspace: "chart",
      symbolSearchOpen: false,
      chartType: "candles",
      bottomTab: "options",
      bottomHeight: 260,
      replayActive: false,
      replayIndex: null,
      namedWorkspaceId: "intraday",
      namedWorkspaces: { ...EMPTY_NAMED },
      drawingTool: "cursor",
      magnet: false,
      drawingsLocked: false,
      drawingsHidden: false,
      setLayout: (layout) =>
        set((s) => {
          if (s.layout === layout && s.panes.length === LAYOUT_COUNTS[layout]) return s;
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
      setPaneOverlays: (paneId, overlays) =>
        set((s) => ({
          panes: s.panes.map((p) => (p.id === paneId ? { ...p, overlays: { ...overlays } } : p)),
        })),
      syncPrimarySymbol: (symbolId) => {
        const s = get();
        if (!symbolId) return;
        if (s.layout === "1") {
          const cur = s.panes[0];
          if (cur?.symbolId === symbolId && s.activePaneId === (cur?.id ?? "pane-1")) return;
          set({
            panes: s.panes.map((p, i) => (i === 0 ? { ...p, symbolId } : p)),
            activePaneId: s.panes[0]?.id ?? "pane-1",
          });
          return;
        }
        const active = s.panes.find((p) => p.id === s.activePaneId);
        if (active?.symbolId === symbolId) return;
        set({
          panes: s.panes.map((p) => (p.id === s.activePaneId ? { ...p, symbolId } : p)),
        });
      },
      setAiPanelMode: (mode) => set({ aiPanelMode: mode }),
      cycleAiPanel: () =>
        set((s) => {
          const order: AiPanelMode[] = ["full", "strip", "hidden"];
          const i = order.indexOf(s.aiPanelMode);
          return { aiPanelMode: order[(i + 1) % order.length] };
        }),
      setWatchlistOpen: (open) => set({ watchlistOpen: open }),
      toggleWatchlist: () => set((s) => ({ watchlistOpen: !s.watchlistOpen })),
      setBottomOpen: (open) => set({ bottomOpen: open }),
      toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
      setBottomTab: (bottomTab) => set({ bottomTab, bottomOpen: true }),
      setBottomHeight: (h) => set({ bottomHeight: clamp(h, 140, 480) }),
      setAnalysisMode: (on) => set({ analysisMode: on }),
      toggleAnalysisMode: () => set((s) => ({ analysisMode: !s.analysisMode })),
      setWatchlistWidth: (w) => set({ watchlistWidth: clamp(w, 180, 420) }),
      setAiPanelWidth: (w) => set({ aiPanelWidth: clamp(w, 280, 560) }),
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
      openRightPanel: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
      setRightPanelWidth: (w) => set({ rightPanelWidth: clamp(w, 280, 560) }),
      setDeskWorkspace: (deskWorkspace) => set({ deskWorkspace }),
      openDeskWorkspace: (ws) => {
        const panelMap: Partial<Record<DeskWorkspace, RightPanelTab>> = {
          ai: "ai",
          journal: "journal",
          orders: "orders",
          positions: "positions",
          portfolio: "portfolio",
          alerts: "alerts",
        };
        if (ws === "chart") {
          set({ deskWorkspace: "chart" });
          return;
        }
        if (ws === "markets") {
          set({ deskWorkspace: "chart", watchlistOpen: true });
          return;
        }
        if (ws === "overview") {
          set({ deskWorkspace: "overview" });
          return;
        }
        // Option Chain + Depth live in the bottom workspace (mockup layout)
        if (ws === "options") {
          set({ deskWorkspace: "chart", bottomOpen: true, bottomTab: "options" });
          return;
        }
        if (ws === "depth") {
          set({ deskWorkspace: "chart", bottomOpen: true, bottomTab: "depth" });
          return;
        }
        if (ws === "orders") {
          set({ deskWorkspace: "chart", bottomOpen: true, bottomTab: "orders", rightPanelOpen: true, rightPanelTab: "orders" });
          return;
        }
        if (ws === "positions") {
          set({ deskWorkspace: "chart", bottomOpen: true, bottomTab: "positions" });
          return;
        }
        if (ws === "portfolio") {
          set({ deskWorkspace: "chart", bottomOpen: true, bottomTab: "portfolio" });
          return;
        }
        if (ws === "journal") {
          set({ deskWorkspace: "chart", bottomOpen: true, bottomTab: "journal", rightPanelOpen: true, rightPanelTab: "journal" });
          return;
        }
        if (ws === "alerts") {
          set({ deskWorkspace: "chart", bottomOpen: true, bottomTab: "alerts" });
          return;
        }
        const tab = panelMap[ws];
        if (tab) {
          set({ deskWorkspace: ws === "ai" ? "ai" : "chart", rightPanelOpen: true, rightPanelTab: tab });
          return;
        }
        set({ deskWorkspace: ws });
      },
      setSymbolSearchOpen: (open) => set({ symbolSearchOpen: open }),
      setChartType: (chartType) => set({ chartType }),
      setReplayActive: (on) =>
        set({
          replayActive: on,
          replayIndex: on ? get().replayIndex : null,
        }),
      setReplayIndex: (replayIndex) => set({ replayIndex }),
      applyNamedWorkspace: (id) => {
        const snap = get().namedWorkspaces[id];
        if (!snap) {
          set({ namedWorkspaceId: id });
          return;
        }
        const count = LAYOUT_COUNTS[snap.layout] ?? 1;
        const panes = resizePanes(snap.panes, count, snap.panes[0]?.symbolId ?? "");
        set({
          namedWorkspaceId: id,
          layout: snap.layout,
          panes,
          activePaneId: panes.some((p) => p.id === snap.activePaneId)
            ? snap.activePaneId
            : panes[0]?.id,
          rightPanelOpen: snap.rightPanelOpen,
          rightPanelTab: snap.rightPanelTab,
          chartType: snap.chartType,
          aiPanelMode: snap.aiPanelMode,
          replayActive: false,
          replayIndex: null,
        });
      },
      saveNamedWorkspace: (id) => {
        const s = get();
        set({
          namedWorkspaceId: id,
          namedWorkspaces: {
            ...s.namedWorkspaces,
            [id]: snapshotFrom(s),
          },
        });
      },
      setDrawingTool: (tool) => set({ drawingTool: tool }),
      setMagnet: (on) => set({ magnet: on }),
      toggleMagnet: () => set((s) => ({ magnet: !s.magnet })),
      setDrawingsLocked: (on) => set({ drawingsLocked: on }),
      toggleDrawingsLocked: () => set((s) => ({ drawingsLocked: !s.drawingsLocked })),
      setDrawingsHidden: (on) => set({ drawingsHidden: on }),
      toggleDrawingsHidden: () => set((s) => ({ drawingsHidden: !s.drawingsHidden })),
    }),
    {
      name: "trademind.workspace",
      version: 11,
      partialize: (s) => ({
        layout: s.layout,
        panes: s.panes,
        activePaneId: s.activePaneId,
        aiPanelMode: s.aiPanelMode,
        watchlistOpen: s.watchlistOpen,
        watchlistWidth: s.watchlistWidth,
        aiPanelWidth: s.aiPanelWidth,
        rightPanelOpen: s.rightPanelOpen,
        rightPanelTab: s.rightPanelTab,
        rightPanelWidth: s.rightPanelWidth,
        deskWorkspace: s.deskWorkspace,
        chartType: s.chartType,
        bottomOpen: s.bottomOpen,
        bottomTab: s.bottomTab,
        bottomHeight: s.bottomHeight,
        namedWorkspaceId: s.namedWorkspaceId,
        namedWorkspaces: s.namedWorkspaces,
        magnet: s.magnet,
        drawingsLocked: s.drawingsLocked,
        drawingsHidden: s.drawingsHidden,
      }),
      migrate: (persisted, fromVersion) => {
        const p = (persisted ?? {}) as Partial<WorkspaceState> & {
          aiPanelOpen?: boolean;
        };
        let layout: LayoutId = fromVersion < 11 ? "1" : isLayoutId(p.layout) ? p.layout : "1";
        const panes = (p.panes ?? [makePane("pane-1")]).map((pane) => ({
          ...pane,
          timeframe: (
            ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(pane.timeframe)
              ? pane.timeframe
              : "5m"
          ) as Timeframe,
          overlays: normalizeOverlays(pane.overlays as Partial<Record<string, boolean>>),
        }));
        const count = LAYOUT_COUNTS[layout] ?? 1;
        const sized = resizePanes(panes, count, panes[0]?.symbolId ?? "");
        let aiPanelMode: AiPanelMode = p.aiPanelMode ?? "hidden";
        if (fromVersion < 6 && p.aiPanelOpen === false) aiPanelMode = "hidden";
        if (fromVersion < 8) aiPanelMode = "hidden";
        const deskWorkspace: DeskWorkspace =
          p.deskWorkspace &&
          ["chart", "overview", "options", "orders", "positions", "portfolio", "ai", "journal", "alerts", "depth", "markets"].includes(
            p.deskWorkspace,
          )
            ? p.deskWorkspace
            : "chart";
        const bottomTab: BottomWorkspaceTab =
          p.bottomTab &&
          ["options", "orders", "positions", "ticket", "portfolio", "depth", "journal", "alerts", "analysis"].includes(
            p.bottomTab,
          )
            ? p.bottomTab
            : "options";
        return {
          ...p,
          panes: sized,
          layout,
          activePaneId: p.activePaneId ?? sized[0]?.id ?? "pane-1",
          aiPanelMode,
          watchlistOpen: fromVersion < 11 ? false : (p.watchlistOpen ?? false),
          watchlistWidth: p.watchlistWidth ?? 260,
          aiPanelWidth: p.aiPanelWidth ?? 340,
          rightPanelOpen: fromVersion < 11 ? false : (p.rightPanelOpen ?? false),
          rightPanelTab: fromVersion < 10 ? "ai" : (p.rightPanelTab ?? "ai"),
          rightPanelWidth: p.rightPanelWidth ?? 340,
          deskWorkspace,
          symbolSearchOpen: false,
          chartType: p.chartType === "area" ? "area" : (p.chartType ?? "candles"),
          bottomOpen: fromVersion < 11 ? false : (p.bottomOpen ?? false),
          bottomTab,
          bottomHeight: p.bottomHeight ?? 260,
          replayActive: false,
          replayIndex: null,
          namedWorkspaceId: fromVersion < 10 ? "intraday" : (p.namedWorkspaceId ?? "intraday"),
          namedWorkspaces: { ...EMPTY_NAMED, ...(p.namedWorkspaces ?? {}) },
          drawingTool: "cursor",
          analysisMode: false,
          magnet: p.magnet ?? false,
          drawingsLocked: p.drawingsLocked ?? false,
          drawingsHidden: p.drawingsHidden ?? false,
        } as WorkspaceState;
      },
    },
  ),
);

/** CSS grid template for the chart matrix. */
export function layoutGridClass(layout: LayoutId): string {
  switch (layout) {
    case "1":
      return "grid-cols-1 grid-rows-1";
    case "2v":
      return "grid-cols-2 grid-rows-1";
    case "2h":
      return "grid-cols-1 grid-rows-2";
    case "3v":
      return "grid-cols-3 grid-rows-1";
    case "3h":
      return "grid-cols-1 grid-rows-3";
    case "3l":
      return "grid-cols-2 grid-rows-2";
    case "3t":
      return "grid-cols-2 grid-rows-2";
    case "4":
      return "grid-cols-2 grid-rows-2";
    case "4v":
      return "grid-cols-4 grid-rows-1";
    case "4h":
      return "grid-cols-1 grid-rows-4";
    case "4l":
      return "grid-cols-2 grid-rows-3";
    case "6":
      return "grid-cols-3 grid-rows-2";
    case "6h":
      return "grid-cols-2 grid-rows-3";
    case "8":
      return "grid-cols-4 grid-rows-2";
    default:
      return "grid-cols-1 grid-rows-1";
  }
}

/** Span classes for asymmetric layouts (index → grid placement). */
export function layoutPaneClass(layout: LayoutId, index: number): string {
  if (layout === "3l") {
    if (index === 0) return "row-span-2";
    return "";
  }
  if (layout === "3t") {
    if (index === 0) return "col-span-2";
    return "";
  }
  if (layout === "4l") {
    if (index === 0) return "row-span-3";
    return "";
  }
  return "";
}
