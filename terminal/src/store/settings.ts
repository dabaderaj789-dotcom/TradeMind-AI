import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "../lib/endpoints";
import { DEFAULT_OVERLAYS, type OverlayId } from "../lib/overlays";

export type ThemeMode = "dark" | "light";

export interface ScannerFilters {
  minConfidence: number;
  setupType: string;
  trend: string;
  onlyWithSetups: boolean;
}

interface SettingsState {
  defaultTimeframe: Timeframe;
  overlays: Record<OverlayId, boolean>;
  theme: ThemeMode;
  refreshInterval: number;
  scannerFilters: ScannerFilters;
  /** When false (default), chart hides historical SMC objects. */
  showHistoricalOverlays: boolean;
  /** Developer: show OHLC compare panel vs provider reference feed. */
  tvCompareMode: boolean;
  setDefaultTimeframe: (tf: Timeframe) => void;
  setOverlay: (id: OverlayId, on: boolean) => void;
  setOverlays: (overlays: Record<OverlayId, boolean>) => void;
  setTheme: (theme: ThemeMode) => void;
  setRefreshInterval: (ms: number) => void;
  setScannerFilters: (patch: Partial<ScannerFilters>) => void;
  setShowHistoricalOverlays: (on: boolean) => void;
  setTvCompareMode: (on: boolean) => void;
  reset: () => void;
}

const DEFAULT_FILTERS: ScannerFilters = {
  minConfidence: 62,
  setupType: "",
  trend: "",
  onlyWithSetups: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      defaultTimeframe: "1h",
      overlays: { ...DEFAULT_OVERLAYS },
      theme: "dark",
      refreshInterval: 20_000,
      scannerFilters: { ...DEFAULT_FILTERS },
      showHistoricalOverlays: false,
      tvCompareMode: false,
      setDefaultTimeframe: (tf) => set({ defaultTimeframe: tf }),
      setOverlay: (id, on) => set((s) => ({ overlays: { ...s.overlays, [id]: on } })),
      setOverlays: (overlays) => set({ overlays }),
      setTheme: (theme) => set({ theme }),
      setRefreshInterval: (ms) => set({ refreshInterval: ms }),
      setScannerFilters: (patch) => set((s) => ({ scannerFilters: { ...s.scannerFilters, ...patch } })),
      setShowHistoricalOverlays: (on) => set({ showHistoricalOverlays: on }),
      setTvCompareMode: (on) => set({ tvCompareMode: on }),
      reset: () =>
        set({
          defaultTimeframe: "1h",
          overlays: { ...DEFAULT_OVERLAYS },
          theme: "dark",
          refreshInterval: 20_000,
          scannerFilters: { ...DEFAULT_FILTERS },
          showHistoricalOverlays: false,
          tvCompareMode: false,
        }),
    }),
    {
      name: "trademind.settings",
      version: 6,
      migrate: (persisted, fromVersion) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        let overlays = { ...DEFAULT_OVERLAYS, ...(p.overlays ?? {}) };
        // v6: repair stale sessions that persisted all core overlays as disabled.
        // This is a one-time UI-state migration; users can still toggle them afterward.
        if (fromVersion < 6) {
          overlays = {
            ...overlays,
            marketStructure: true,
            sweeps: true,
            bos: true,
            choch: true,
            orderBlocks: true,
            fvg: true,
            tradeSetups: true,
          };
        }
        return {
          ...p,
          overlays,
          showHistoricalOverlays: p.showHistoricalOverlays ?? false,
          tvCompareMode: p.tvCompareMode ?? false,
          scannerFilters: { ...DEFAULT_FILTERS, ...(p.scannerFilters ?? {}) },
        } as SettingsState;
      },
    },
  ),
);
