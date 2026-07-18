import type { ReactNode } from "react";
import { cx } from "../../lib/format";
import { useDrawings } from "../../store/drawings";
import { useWorkspace, type DrawingToolId } from "../../store/workspace";

const TOOLS: { id: DrawingToolId; label: string; icon: ReactNode; group?: string }[] = [
  { id: "cursor", label: "Select", icon: <IconCursor />, group: "nav" },
  { id: "crosshair", label: "Crosshair", icon: <IconCrosshair />, group: "nav" },
  { id: "hline", label: "Horizontal", icon: <IconHLine />, group: "draw" },
  { id: "trendline", label: "Trend line", icon: <IconTrend />, group: "draw" },
  { id: "ray", label: "Ray", icon: <IconRay />, group: "draw" },
  { id: "rect", label: "Rectangle", icon: <IconRect />, group: "draw" },
  { id: "fib", label: "Fibonacci", icon: <IconFib />, group: "draw" },
  { id: "text", label: "Text", icon: <IconText />, group: "draw" },
  { id: "measure", label: "Measure", icon: <IconMeasure />, group: "draw" },
  { id: "eraser", label: "Eraser", icon: <IconEraser />, group: "edit" },
];

/** Professional left drawing toolbar (TradingView-style chrome, original icons). */
export function DrawingToolbar({ symbolId }: { symbolId: string }) {
  const tool = useWorkspace((s) => s.drawingTool);
  const setTool = useWorkspace((s) => s.setDrawingTool);
  const clear = useDrawings((s) => s.clear);
  const setDraft = useDrawings((s) => s.setDraft);

  return (
    <aside
      className="hidden h-full w-11 shrink-0 flex-col items-center border-r border-subtle/40 bg-surface/95 py-2 lg:flex"
      aria-label="Drawing tools"
    >
      <div className="flex flex-1 flex-col items-center gap-0.5">
        {TOOLS.map((t, i) => {
          const prev = TOOLS[i - 1];
          const showSep = prev && prev.group !== t.group;
          return (
            <div key={t.id} className="flex flex-col items-center">
              {showSep && <div className="my-1.5 h-px w-6 bg-subtle/50" />}
              <button
                type="button"
                title={t.label}
                onClick={() => {
                  setTool(t.id);
                  setDraft(null);
                }}
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 ease-terminal",
                  tool === t.id
                    ? "bg-brand/15 text-brand shadow-glow ring-1 ring-brand/35"
                    : "text-faint hover:bg-elevated hover:text-content",
                )}
              >
                {t.icon}
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        title="Clear drawings"
        className="mb-1 flex h-8 w-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-bear/10 hover:text-bear"
        onClick={() => {
          if (symbolId && confirm("Clear all drawings on this chart?")) clear(symbolId);
        }}
      >
        <IconTrash />
      </button>
    </aside>
  );
}

function IconCursor() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 3l7 17 2.2-6.8L20 11 4 3z" opacity="0.9" />
    </svg>
  );
}
function IconCrosshair() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}
function IconHLine() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 12h18" />
      <path d="M7 9v6M17 9v6" />
    </svg>
  );
}
function IconTrend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 18L20 6" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
      <circle cx="20" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}
function IconRay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 18L20 6" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}
function IconRect() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  );
}
function IconFib() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M3 10h18M3 14h18M3 18h18" opacity="0.7" />
      <path d="M3 6h18M3 18h18" strokeWidth="2" />
    </svg>
  );
}
function IconText() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M5 6h14M12 6v12" />
    </svg>
  );
}
function IconMeasure() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 18L20 6" />
      <path d="M7 18h-3v-3M17 6h3v3" />
    </svg>
  );
}
function IconEraser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M16 3l5 5-11 11H5v-5L16 3z" />
      <path d="M8 20h12" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13" />
    </svg>
  );
}
