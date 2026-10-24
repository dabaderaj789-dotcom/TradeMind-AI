/**
 * Secondary chart toolbar — TFs, chart type, indicators, templates, layout, replay, focus.
 */

import { useEffect, useRef, useState } from "react";
import { TimeframeSelector } from "../chart/TimeframeSelector";
import { OverlayToggles } from "../chart/OverlayToggles";
import { LayoutPicker } from "../chart/LayoutPicker";
import type { Timeframe } from "../../lib/endpoints";
import { type OverlayId } from "../../lib/overlays";
import { cx } from "../../lib/format";
import {
  PRIMARY_LAYOUTS,
  useWorkspace,
  type ChartTypeId,
  type LayoutId,
} from "../../store/workspace";

const CHART_TYPES: Array<{ id: ChartTypeId; label: string }> = [
  { id: "candles", label: "Candles" },
  { id: "bars", label: "Bars" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "heikin", label: "Heikin Ashi" },
];

export function ChartToolbar({
  timeframe,
  onTimeframe,
  overlays,
  onOverlay,
  compact = false,
}: {
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  overlays: Record<OverlayId, boolean>;
  onOverlay: (id: OverlayId, on: boolean) => void;
  onApplyOverlays?: (next: Record<OverlayId, boolean>) => void;
  compact?: boolean;
}) {
  const chartType = useWorkspace((s) => s.chartType);
  const setChartType = useWorkspace((s) => s.setChartType);
  const layout = useWorkspace((s) => s.layout);
  const setLayout = useWorkspace((s) => s.setLayout);
  const setAnalysisMode = useWorkspace((s) => s.setAnalysisMode);
  const replayActive = useWorkspace((s) => s.replayActive);
  const setReplayActive = useWorkspace((s) => s.setReplayActive);

  const [typeOpen, setTypeOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div
      ref={rootRef}
      className={cx(
        "desk-toolbar",
        compact ? "overflow-x-auto" : "",
      )}
    >
      <TimeframeSelector value={timeframe} onChange={onTimeframe} compact />

      <div className="relative">
        <button
          type="button"
          className={cx("btn-chip !text-[10px]", typeOpen && "btn-chip-active")}
          onClick={() => setTypeOpen((v) => !v)}
        >
          {CHART_TYPES.find((t) => t.id === chartType)?.label ?? "Candles"}
        </button>
        {typeOpen && (
          <div className="absolute left-0 top-full z-40 mt-1 min-w-[140px] rounded border border-subtle bg-surface py-1 shadow-pop">
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cx(
                  "block w-full px-3 py-1.5 text-left text-xs hover:bg-elevated",
                  chartType === t.id && "text-brand",
                )}
                onClick={() => {
                  setChartType(t.id);
                  setTypeOpen(false);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <OverlayToggles overlays={overlays} onChange={onOverlay} />

      <div className="hidden items-center gap-0.5 sm:flex">
        {PRIMARY_LAYOUTS.map((id) => (
          <button
            key={id}
            type="button"
            title={id === "1" ? "1 chart" : id === "2v" ? "2 charts" : "4 charts"}
            className={cx("btn-chip !px-2 !text-[10px]", layout === id && "btn-chip-active")}
            onClick={() => setLayout(id as LayoutId)}
          >
            {id === "1" ? "1" : id === "2v" ? "2" : "4"}
          </button>
        ))}
        <LayoutPicker />
      </div>

      <button
        type="button"
        className={cx("btn-chip !text-[10px]", replayActive && "btn-chip-active")}
        onClick={() => setReplayActive(!replayActive)}
        title="Replay loaded candles"
      >
        Replay
      </button>

      <div className="flex-1" />

      <button
        type="button"
        className="btn-chip border-brand/40 text-[10px] text-brand"
        onClick={() => setAnalysisMode(true)}
      >
        Focus
      </button>
    </div>
  );
}
