/**
 * Drawing toolbar — high-contrast category rail + flyout menus.
 * TradeMind identity (not a clone of any third-party UI).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/format";
import { useDrawings } from "../../store/drawings";
import { useWorkspace, type DrawingToolId } from "../../store/workspace";

type FlyoutId = "lines" | "fib" | "position" | "shapes" | "annotate" | "measure" | null;

interface ToolItem {
  id: DrawingToolId;
  label: string;
  shortcut?: string;
  icon: ReactNode;
}

const LINE_TOOLS: ToolItem[] = [
  { id: "trendline", label: "Trend Line", shortcut: "T", icon: <ITrend /> },
  { id: "hline", label: "Horizontal Line", shortcut: "H", icon: <IHLine /> },
  { id: "vline", label: "Vertical Line", icon: <IVLine /> },
  { id: "ray", label: "Ray", icon: <IRay /> },
  { id: "arrow", label: "Arrow", icon: <IArrow /> },
];

const FIB_TOOLS: ToolItem[] = [
  { id: "fib", label: "Fib Retracement", shortcut: "F", icon: <IFib /> },
];

const SHAPE_TOOLS: ToolItem[] = [
  { id: "rect", label: "Rectangle", shortcut: "R", icon: <IRect /> },
  { id: "brush", label: "Brush", icon: <IBrush /> },
];

const ANNOTATE_TOOLS: ToolItem[] = [
  { id: "text", label: "Text", icon: <IText /> },
];

const POSITION_TOOLS: ToolItem[] = [
  { id: "long", label: "Long position", icon: <ILong /> },
  { id: "short", label: "Short position", icon: <IShort /> },
];

const MEASURE_TOOLS: ToolItem[] = [
  { id: "measure", label: "Price Measure", icon: <IMeasure /> },
  { id: "eraser", label: "Eraser", icon: <IEraser /> },
];

function categoryHasTool(tools: ToolItem[], tool: DrawingToolId) {
  return tools.some((t) => t.id === tool);
}

/** Professional left drawing toolbar with bold icons + flyouts.
 * Desktop: always expanded rail. Mobile: collapsible thumb rail over the chart.
 */
export function DrawingToolbar({
  symbolId,
  mobile = false,
}: {
  symbolId: string;
  mobile?: boolean;
}) {
  const tool = useWorkspace((s) => s.drawingTool);
  const setTool = useWorkspace((s) => s.setDrawingTool);
  const magnet = useWorkspace((s) => s.magnet);
  const toggleMagnet = useWorkspace((s) => s.toggleMagnet);
  const locked = useWorkspace((s) => s.drawingsLocked);
  const toggleLocked = useWorkspace((s) => s.toggleDrawingsLocked);
  const hidden = useWorkspace((s) => s.drawingsHidden);
  const toggleHidden = useWorkspace((s) => s.toggleDrawingsHidden);
  const clear = useDrawings((s) => s.clear);
  const setDraft = useDrawings((s) => s.setDraft);

  const [flyout, setFlyout] = useState<FlyoutId>(null);
  const [collapsed, setCollapsed] = useState(mobile);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setFlyout(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  const pick = (id: DrawingToolId) => {
    setTool(id);
    setDraft(null);
    setFlyout(null);
  };

  const toggleFly = (id: FlyoutId) => setFlyout((cur) => (cur === id ? null : id));

  if (mobile && collapsed) {
    return (
      <aside
        className="pointer-events-auto absolute left-2 z-30 lg:hidden"
        style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        aria-label="Expand drawing tools"
      >
        <button
          type="button"
          className="flex h-12 w-11 items-center justify-center rounded-xl border border-subtle/80 bg-surface/95 text-content shadow-card backdrop-blur-md"
          onClick={() => setCollapsed(false)}
          title="Drawing tools"
        >
          <ITools />
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={rootRef}
      className={cx(
        "draw-rail relative z-30 flex shrink-0 flex-col",
        mobile
          ? "absolute left-0 top-0 bottom-0 max-h-full shadow-card lg:hidden"
          : "hidden h-full lg:flex",
      )}
      aria-label="Drawing tools"
    >
      {mobile && (
        <button
          type="button"
          className="flex h-11 w-full shrink-0 items-center justify-center border-b border-subtle text-lg text-faint"
          onClick={() => {
            setFlyout(null);
            setCollapsed(true);
          }}
          title="Collapse tools"
        >
          ‹
        </button>
      )}
      <div
        className={cx(
          "flex flex-1 flex-col items-center overflow-y-auto overscroll-contain py-1.5",
          mobile ? "gap-1" : "gap-0.5",
        )}
      >
        {/* Cursor / Crosshair */}
        <RailBtn
          title="Select (V)"
          active={tool === "cursor"}
          onClick={() => pick("cursor")}
        >
          <ICursor />
        </RailBtn>
        <RailBtn
          title="Crosshair (C)"
          active={tool === "crosshair"}
          onClick={() => pick("crosshair")}
        >
          <ICrosshair />
        </RailBtn>

        <Sep />

        {/* Lines flyout */}
        <RailBtn
          title="Lines"
          active={categoryHasTool(LINE_TOOLS, tool) || flyout === "lines"}
          flyoutOpen={flyout === "lines"}
          onClick={() => toggleFly("lines")}
        >
          <ITrend />
        </RailBtn>
        {flyout === "lines" && (
          <Flyout title="LINES" items={LINE_TOOLS} active={tool} onPick={pick} mobile={mobile} />
        )}

        {/* Fib flyout */}
        <RailBtn
          title="Fibonacci"
          active={categoryHasTool(FIB_TOOLS, tool) || flyout === "fib"}
          flyoutOpen={flyout === "fib"}
          onClick={() => toggleFly("fib")}
        >
          <IFib />
        </RailBtn>
        {flyout === "fib" && (
          <Flyout title="FIBONACCI" items={FIB_TOOLS} active={tool} onPick={pick} mobile={mobile} />
        )}

        <RailBtn
          title="Long / Short"
          active={categoryHasTool(POSITION_TOOLS, tool) || flyout === "position"}
          flyoutOpen={flyout === "position"}
          onClick={() => toggleFly("position")}
        >
          <ILong />
        </RailBtn>
        {flyout === "position" && (
          <Flyout title="POSITION" items={POSITION_TOOLS} active={tool} onPick={pick} mobile={mobile} />
        )}

        {/* Shapes flyout */}
        <RailBtn
          title="Shapes"
          active={categoryHasTool(SHAPE_TOOLS, tool) || flyout === "shapes"}
          flyoutOpen={flyout === "shapes"}
          onClick={() => toggleFly("shapes")}
        >
          <IRect />
        </RailBtn>
        {flyout === "shapes" && (
          <Flyout title="SHAPES" items={SHAPE_TOOLS} active={tool} onPick={pick} mobile={mobile} />
        )}

        {/* Annotate */}
        <RailBtn
          title="Annotate"
          active={categoryHasTool(ANNOTATE_TOOLS, tool) || flyout === "annotate"}
          flyoutOpen={flyout === "annotate"}
          onClick={() => toggleFly("annotate")}
        >
          <IText />
        </RailBtn>
        {flyout === "annotate" && (
          <Flyout title="ANNOTATION" items={ANNOTATE_TOOLS} active={tool} onPick={pick} mobile={mobile} />
        )}

        {/* Measure */}
        <RailBtn
          title="Measure"
          active={categoryHasTool(MEASURE_TOOLS, tool) || flyout === "measure"}
          flyoutOpen={flyout === "measure"}
          onClick={() => toggleFly("measure")}
        >
          <IMeasure />
        </RailBtn>
        {flyout === "measure" && (
          <Flyout title="MEASURE" items={MEASURE_TOOLS} active={tool} onPick={pick} mobile={mobile} />
        )}

        <Sep />

        {/* Zoom reset */}
        <RailBtn
          title="Reset chart view"
          active={false}
          onClick={() => {
            document.querySelector(".chart-stage")?.dispatchEvent(new Event("tm-fit-content"));
            window.dispatchEvent(new CustomEvent("trademind:fit-chart"));
          }}
        >
          <IZoom />
        </RailBtn>

        <Sep />

        <RailBtn title="Magnet — snap to OHLC (M)" active={magnet} onClick={toggleMagnet}>
          <IMagnet />
        </RailBtn>
        <RailBtn title="Lock drawings" active={locked} onClick={toggleLocked}>
          <ILock />
        </RailBtn>
        <RailBtn title="Hide drawings" active={hidden} onClick={toggleHidden}>
          <IEyeOff />
        </RailBtn>
      </div>

      <div className="border-t border-subtle py-2">
        <RailBtn
          title="Delete all drawings"
          active={false}
          danger
          onClick={() => {
            if (locked) {
              alert("Drawings are locked. Unlock first.");
              return;
            }
            if (symbolId && confirm("Clear all drawings on this chart?")) clear(symbolId);
          }}
        >
          <ITrash />
        </RailBtn>
      </div>
    </aside>
  );
}

function ITools() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function Sep() {
  return <div className="my-1.5 h-px w-7 bg-subtle" />;
}

function RailBtn({
  title,
  active,
  flyoutOpen,
  danger,
  onClick,
  children,
}: {
  title: string;
  active: boolean;
  flyoutOpen?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "draw-rail-btn",
        danger && !active && "hover:bg-bear/10 hover:text-bear",
        active && "draw-rail-btn-active",
        flyoutOpen && "draw-rail-btn-active",
      )}
    >
      {children}
      {flyoutOpen && (
        <span className="absolute -right-px top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-l-[6px] border-y-transparent border-l-surface drop-shadow-sm" />
      )}
    </button>
  );
}

function Flyout({
  title,
  items,
  active,
  onPick,
  mobile,
}: {
  title: string;
  items: ToolItem[];
  active: DrawingToolId;
  onPick: (id: DrawingToolId) => void;
  mobile?: boolean;
}) {
  return (
    <div
      className={cx(
        "draw-flyout z-50 max-h-[min(70vh,420px)] min-w-[220px] overflow-y-auto overscroll-contain border border-subtle bg-surface py-2 shadow-pop animate-fade-in",
        mobile
          ? "fixed left-12 top-[20%] max-h-[60vh]"
          : "absolute left-full top-0 ml-0",
      )}
    >
      <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        {title}
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          className={cx(
            "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
            active === item.id ? "bg-brand/12 text-brand" : "text-content hover:bg-elevated",
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
          <span className="flex-1 text-[13px] font-semibold tracking-tight">{item.label}</span>
          {item.shortcut && (
            <span className="font-mono text-[10px] font-medium text-faint">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* —— Bold stroke icons (2.25) — high contrast —— */

const SW = 2.25;

function ICursor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 3.5L18.5 12l-6.2 1.6L9.8 21 5 3.5z" />
    </svg>
  );
}
function ICrosshair() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v4.2M12 17.3v4.2M2.5 12h4.2M17.3 12h4.2" />
    </svg>
  );
}
function ITrend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M4 18L20 5" />
      <circle cx="4" cy="18" r="2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IHLine() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M3 12h18" />
      <path d="M7 8.5v7M17 8.5v7" />
    </svg>
  );
}
function IVLine() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M12 3v18" />
      <path d="M8.5 7h7M8.5 17h7" />
    </svg>
  );
}
function IRay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M4 18L21 4" />
      <circle cx="4" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19L19 5" />
      <path d="M10 5h9v9" />
    </svg>
  );
}
function IFib() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      <circle cx="20" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IRect() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW}>
      <rect x="4" y="6" width="16" height="12" rx="1.5" />
    </svg>
  );
}
function IBrush() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4.5l5 5-9 9H5.5v-5l9-9z" />
      <path d="M4 20c2.5-3.5 6-5 9.5-5" />
    </svg>
  );
}
function IText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M5 6h14" />
      <path d="M12 6v13" />
      <path d="M8.5 19h7" />
    </svg>
  );
}
function IMeasure() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18L19 5" />
      <path d="M7.5 18H4v-3.5M16.5 5H20v3.5" />
    </svg>
  );
}
function ILong() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M12 19V5" />
      <path d="M7 9l5-4 5 4" />
      <path d="M5 19h14" />
    </svg>
  );
}
function IShort() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M12 5v14" />
      <path d="M7 15l5 4 5-4" />
      <path d="M5 5h14" />
    </svg>
  );
}
function IEraser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinejoin="round">
      <path d="M15.5 3.5l5 5-11 11H4.5v-5l11-11z" />
      <path d="M8 20h12" strokeLinecap="round" />
    </svg>
  );
}
function IZoom() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M16 16l5 5" />
      <path d="M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  );
}
function IMagnet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round">
      <path d="M6.5 4v8.5a5.5 5.5 0 0011 0V4" />
      <path d="M6.5 4h3.2v8.5M14.3 4H17.5v8.5" />
    </svg>
  );
}
function ILock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}
function IEyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.4 2.4 0 003 3" />
      <path d="M9.4 5.3A11 11 0 0121.2 12a11 11 0 01-3.2 4.1M6.2 6.2A11 11 0 002.8 12a11 11 0 009.2 6.5c1.3 0 2.6-.3 3.8-.8" />
    </svg>
  );
}
function ITrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l1 13h6l1-13" />
    </svg>
  );
}
