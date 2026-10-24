/**
 * Chart drawing interaction layer — V5 tools.
 * Select · drag-to-move · delete (TradingView / Angel One style).
 */

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { LineStyle, type IPriceLine } from "lightweight-charts";
import {
  drawingId,
  translateDrawing,
  useDrawings,
  type ChartDrawing,
} from "../../store/drawings";
import { useWorkspace } from "../../store/workspace";
import type { Candle } from "../../lib/types";
import { toChartTime } from "../../lib/chartTime";
import { num } from "../../lib/format";

/** Standard Fib + explicit 0.6 (user highlight request). */
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.6, 0.618, 0.786, 1];
/** Levels drawn bold / bright — 0 and 0.6 */
const FIB_HIGHLIGHT = new Set([0, 0.6]);
const EMPTY_DRAWINGS: ChartDrawing[] = [];
const HIT_PX = 10;

interface Props {
  symbolId: string;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | ISeriesApi<"Bar"> | ISeriesApi<"Line"> | null;
  candles?: Candle[];
}

type SeriesLike = ISeriesApi<"Candlestick"> | ISeriesApi<"Bar"> | ISeriesApi<"Line">;

type DragState = {
  id: string;
  origin: ChartDrawing;
  startT: number;
  startP: number;
};

export function DrawingOverlay({ symbolId, chart, series, candles = [] }: Props) {
  const tool = useWorkspace((s) => s.drawingTool);
  const magnet = useWorkspace((s) => s.magnet);
  const locked = useWorkspace((s) => s.drawingsLocked);
  const hidden = useWorkspace((s) => s.drawingsHidden);
  const setTool = useWorkspace((s) => s.setDrawingTool);
  const toggleMagnet = useWorkspace((s) => s.toggleMagnet);
  const toggleHidden = useWorkspace((s) => s.toggleDrawingsHidden);

  const drawings = useDrawings((s) => s.bySymbol[symbolId] ?? EMPTY_DRAWINGS);
  const add = useDrawings((s) => s.add);
  const update = useDrawings((s) => s.update);
  const remove = useDrawings((s) => s.remove);
  const draft = useDrawings((s) => s.draft);
  const setDraft = useDrawings((s) => s.setDraft);
  const removeNearest = useDrawings((s) => s.removeNearest);
  const clear = useDrawings((s) => s.clear);

  const overlayRef = useRef<HTMLDivElement>(null);
  const hLinesRef = useRef<IPriceLine[]>([]);
  const brushRef = useRef<Array<{ t: number; p: number }>>([]);
  const dragRef = useRef<DragState | null>(null);
  const didDragRef = useRef(false);
  const strokeRef = useRef<{ t: number; p: number; x: number; y: number; moved: boolean } | null>(null);

  const [measure, setMeasure] = useState<string | null>(null);
  const [cursorHint, setCursorHint] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; price: number; time: number; hitId?: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<{ t: number; p: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isTwoPointTool = (t: string) =>
    t === "trendline" ||
    t === "ray" ||
    t === "arrow" ||
    t === "rect" ||
    t === "fib" ||
    t === "measure" ||
    t === "long" ||
    t === "short";

  const drawingMode = tool !== "cursor" && tool !== "crosshair";
  /** Only steal pointer events when placing/editing drawings — otherwise chart gets wheel + pan. */
  const capturePointer = !hidden && (drawingMode || !!selectedId || !!draft?.a);
  const interactive = !hidden && (drawingMode || tool === "cursor" || !!selectedId || !!draft?.a);

  const snap = (t: number, p: number): { t: number; p: number } => {
    if (!magnet || !candles.length) return { t, p };
    let best = candles[0];
    let bestDt = Infinity;
    for (const c of candles) {
      const ct = toChartTime(c.open_time) as number;
      const dt = Math.abs(ct - t);
      if (dt < bestDt) {
        bestDt = dt;
        best = c;
      }
    }
    const levels = [num(best.open), num(best.high), num(best.low), num(best.close)];
    let nearest = levels[0];
    let bestDp = Infinity;
    for (const lv of levels) {
      const dp = Math.abs(lv - p);
      if (dp < bestDp) {
        bestDp = dp;
        nearest = lv;
      }
    }
    return { t: toChartTime(best.open_time) as number, p: nearest };
  };

  const readPoint = (clientX: number, clientY: number) => {
    if (!chart || !series || !overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const time = chart.timeScale().coordinateToTime(x) as Time | null;
    const price = series.coordinateToPrice(y);
    if (time == null || price == null || !Number.isFinite(price as number)) return null;
    const t = timeToSeconds(time);
    if (t == null) return null;
    const p = price as number;
    return { ...snap(t, p), x, y };
  };

  const hitTestAt = (clientX: number, clientY: number): ChartDrawing | null => {
    if (!chart || !series || !overlayRef.current || hidden) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return hitTestDrawings(drawings, chart, series, x, y, HIT_PX);
  };

  // HLines as price lines
  useEffect(() => {
    if (!series || hidden) {
      try {
        for (const l of hLinesRef.current) series?.removePriceLine(l);
      } catch {
        /* disposed */
      }
      hLinesRef.current = [];
      return;
    }
    try {
      for (const l of hLinesRef.current) series.removePriceLine(l);
      hLinesRef.current = [];
      for (const d of drawings) {
        if (d.kind !== "hline") continue;
        const selected = d.id === selectedId;
        hLinesRef.current.push(
          series.createPriceLine({
            price: d.price,
            color: selected ? "rgba(79,124,255,0.95)" : d.color,
            lineWidth: selected ? 2 : 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: d.label ?? "H",
          }),
        );
      }
    } catch {
      /* series disposed */
    }
  }, [drawings, series, chart, hidden, selectedId]);

  // Paint canvas
  useEffect(() => {
    if (!chart || !series || !overlayRef.current) return;
    const canvas = overlayRef.current.querySelector("canvas");
    if (!canvas) return;
    const paint = () => {
      try {
        const draftPreview =
          draft?.a && preview && isTwoPointTool(draft.tool)
            ? { tool: draft.tool, a: draft.a, b: preview }
            : draft?.a && isTwoPointTool(draft.tool)
              ? { tool: draft.tool, a: draft.a, b: draft.a }
              : null;
        paintDrawings(
          canvas,
          chart,
          series,
          hidden ? EMPTY_DRAWINGS : drawings,
          draftPreview,
          selectedId,
        );
      } catch {
        /* disposed */
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(overlayRef.current);
    try {
      chart.timeScale().subscribeVisibleLogicalRangeChange(paint);
    } catch {
      /* disposed */
    }
    return () => {
      ro.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(paint);
      } catch {
        /* disposed */
      }
    };
  }, [chart, series, drawings, hidden, draft, preview, selectedId]);

  useEffect(() => {
    if (tool === "cursor") {
      setCursorHint(selectedId ? "Drag to move · Delete to remove" : "Click a drawing to select · drag to move");
      return;
    }
    if (tool === "crosshair") {
      setCursorHint(null);
      return;
    }
    const hints: Record<string, string> = {
      hline: "Click to place horizontal line",
      vline: "Click to place vertical line",
      trendline: "Drag from start to end, or click twice",
      long: "Drag the long box: entry to target",
      short: "Drag the short box: entry to target",
      ray: "Click start, move, click end",
      arrow: "Click start, move, click end",
      rect: "Click first corner, move, click opposite",
      fib: "Click swing high, move, click low",
      brush: "Drag to freehand draw",
      text: "Click to place a note",
      measure: "Click start, move, click end",
      eraser: "Click near a drawing to remove it",
    };
    setCursorHint(hints[tool] ?? null);
  }, [tool, selectedId]);

  useEffect(() => {
    if (!draft?.a) setPreview(null);
  }, [draft]);

  // Delete / Escape for selected drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !locked) {
        e.preventDefault();
        remove(symbolId, selectedId);
        setSelectedId(null);
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        dragRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, locked, remove, symbolId]);

  // Clear selection when switching symbol
  useEffect(() => {
    setSelectedId(null);
    dragRef.current = null;
  }, [symbolId]);

  useEffect(() => {
    if (!chart) return;
    try {
      chart.applyOptions({
        crosshair: {
          vertLine: { visible: true },
          horzLine: { visible: true },
        },
        // Chart owns pan/zoom unless a drawing is being placed or dragged
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: !capturePointer || tool === "crosshair",
          horzTouchDrag: !drawingMode,
          vertTouchDrag: !drawingMode,
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: { time: true, price: true },
        },
      });
    } catch {
      /* disposed */
    }
  }, [chart, tool, capturePointer, drawingMode]);

  // Select drawings via chart click when overlay is not capturing (default cursor).
  useEffect(() => {
    if (!chart || !series || tool !== "cursor" || hidden || capturePointer) return;
    const handler = (param: { point?: { x: number; y: number } | null }) => {
      if (!param.point || locked) {
        setSelectedId(null);
        return;
      }
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      const hit = hitTestAt(rect.left + param.point.x, rect.top + param.point.y);
      setSelectedId(hit?.id ?? null);
    };
    chart.subscribeClick(handler);
    return () => {
      try {
        chart.unsubscribeClick(handler);
      } catch {
        /* */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, tool, hidden, capturePointer, locked, drawings, magnet, candles]);

  // When overlay captures pointers (draw mode), still forward wheel zoom to the chart.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !chart || !capturePointer) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const ts = chart.timeScale();
        const range = ts.getVisibleLogicalRange();
        if (!range) return;
        const rect = el.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const span = range.to - range.from;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0) {
          const shift = (e.deltaX / w) * span * 0.85;
          ts.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
          return;
        }
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / w));
        const zoom = e.deltaY > 0 ? 1.12 : 1 / 1.12;
        const newSpan = Math.min(600, Math.max(6, span * zoom));
        const center = range.from + span * ratio;
        ts.setVisibleLogicalRange({
          from: center - newSpan * ratio,
          to: center + newSpan * (1 - ratio),
        });
      } catch {
        /* disposed */
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [chart, capturePointer]);

  const placeAndSelect = (d: ChartDrawing) => {
    add(symbolId, d);
    setSelectedId(d.id);
    setTool("cursor");
    setDraft(null);
    setPreview(null);
  };

  const onClick = (e: React.MouseEvent) => {
    setMenu(null);
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (!interactive || !chart || !series) return;

    // Select mode (cursor): click drawing to select, empty to deselect
    if (tool === "cursor") {
      if (locked) return;
      const hit = hitTestAt(e.clientX, e.clientY);
      setSelectedId(hit?.id ?? null);
      return;
    }

    if (locked && tool !== "measure") {
      setCursorHint("Drawings locked — unlock to edit");
      return;
    }
    const pt = readPoint(e.clientX, e.clientY);
    if (!pt) return;
    const { t, p } = pt;

    if (tool === "eraser") {
      const hit = hitTestAt(e.clientX, e.clientY);
      if (hit) {
        remove(symbolId, hit.id);
        if (selectedId === hit.id) setSelectedId(null);
      } else {
        removeNearest(symbolId, p, t);
      }
      return;
    }
    if (tool === "hline") {
      placeAndSelect({
        id: drawingId(),
        kind: "hline",
        price: p,
        color: "rgba(94,168,210,0.85)",
        label: "H",
      });
      return;
    }
    if (tool === "vline") {
      placeAndSelect({
        id: drawingId(),
        kind: "vline",
        time: t,
        color: "rgba(94,168,210,0.75)",
      });
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Annotation text", "Note");
      if (!text) return;
      placeAndSelect({
        id: drawingId(),
        kind: "text",
        t,
        p,
        text,
        color: "rgba(232,234,239,0.9)",
      });
      return;
    }
    if (tool === "brush") return;

    if (!isTwoPointTool(tool)) return;

    if (!draft?.a) {
      setDraft({ tool, a: { t, p } });
      setPreview({ t, p });
      return;
    }

    const a = draft.a;
    if (tool === "measure") {
      const pct = ((p - a.p) / Math.max(Math.abs(a.p), 1e-9)) * 100;
      setMeasure(`${(p - a.p).toFixed(2)}  ·  ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`);
      setTimeout(() => setMeasure(null), 3500);
      setDraft(null);
      setPreview(null);
      return;
    }

    placeAndSelect(makeTwoPointDrawing(tool, a, { t, p }));
  };

  const commitStroke = (a: { t: number; p: number }, b: { t: number; p: number }) => {
    if (tool === "measure") {
      const pct = ((b.p - a.p) / Math.max(Math.abs(a.p), 1e-9)) * 100;
      setMeasure(`${(b.p - a.p).toFixed(2)}  ·  ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`);
      setTimeout(() => setMeasure(null), 3500);
      setDraft(null);
      setPreview(null);
      return;
    }
    placeAndSelect(makeTwoPointDrawing(tool, a, b));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (hidden || locked) return;

    // Move an existing drawing only in select mode.
    if (tool === "cursor") {
      const hit = hitTestAt(e.clientX, e.clientY);
      const pt = readPoint(e.clientX, e.clientY);
      if (hit && pt) {
        e.preventDefault();
        setSelectedId(hit.id);
        dragRef.current = {
          id: hit.id,
          origin: structuredClone(hit),
          startT: pt.t,
          startP: pt.p,
        };
        didDragRef.current = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }

    if (isTwoPointTool(tool) && !draft?.a && !locked) {
      const pt = readPoint(e.clientX, e.clientY);
      if (!pt) return;
      strokeRef.current = { t: pt.t, p: pt.p, x: pt.x, y: pt.y, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (tool !== "brush") return;
    const pt = readPoint(e.clientX, e.clientY);
    if (!pt) return;
    brushRef.current = [{ t: pt.t, p: pt.p }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // Drag selected drawing
    if (dragRef.current && !locked) {
      const pt = readPoint(e.clientX, e.clientY);
      if (!pt) return;
      const { origin, startT, startP, id } = dragRef.current;
      const dt = pt.t - startT;
      const dp = pt.p - startP;
      if (Math.abs(dt) > 0 || Math.abs(dp) > 0) didDragRef.current = true;
      update(symbolId, id, translateDrawing(origin, dt, dp));
      return;
    }

    if (strokeRef.current) {
      const pt = readPoint(e.clientX, e.clientY);
      if (!pt) return;
      const dx = pt.x - strokeRef.current.x;
      const dy = pt.y - strokeRef.current.y;
      if (Math.hypot(dx, dy) > 5) {
        strokeRef.current.moved = true;
        setDraft({ tool, a: { t: strokeRef.current.t, p: strokeRef.current.p } });
      }
      setPreview({ t: pt.t, p: pt.p });
      return;
    }

    if (draft?.a && isTwoPointTool(tool)) {
      const pt = readPoint(e.clientX, e.clientY);
      if (pt) setPreview({ t: pt.t, p: pt.p });
      return;
    }
    if (tool !== "brush" || !brushRef.current.length) return;
    const pt = readPoint(e.clientX, e.clientY);
    if (!pt) return;
    brushRef.current.push({ t: pt.t, p: pt.p });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (strokeRef.current) {
      const start = strokeRef.current;
      strokeRef.current = null;
      const pt = readPoint(e.clientX, e.clientY);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      if (start.moved && pt && (pt.t !== start.t || pt.p !== start.p)) {
        didDragRef.current = true;
        commitStroke({ t: start.t, p: start.p }, { t: pt.t, p: pt.p });
      }
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      return;
    }
    if (tool !== "brush" || brushRef.current.length < 2) {
      brushRef.current = [];
      return;
    }
    const d: ChartDrawing = {
      id: drawingId(),
      kind: "brush",
      points: [...brushRef.current],
      color: "rgba(94,168,210,0.85)",
    };
    brushRef.current = [];
    placeAndSelect(d);
  };

  useEffect(() => {
    const host = overlayRef.current?.parentElement;
    if (!host) return;
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      const pt = readPoint(e.clientX, e.clientY);
      if (!pt || !overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const hit = hitTestAt(e.clientX, e.clientY);
      if (hit) setSelectedId(hit.id);
      setMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        price: pt.p,
        time: pt.t,
        hitId: hit?.id,
      });
    };
    const onDbl = () => {
      try {
        chart?.timeScale().fitContent();
      } catch {
        /* */
      }
    };
    host.addEventListener("contextmenu", onCtx);
    host.addEventListener("dblclick", onDbl);
    return () => {
      host.removeEventListener("contextmenu", onCtx);
      host.removeEventListener("dblclick", onDbl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, magnet, candles, symbolId, drawings, hidden]);

  const selected = drawings.find((d) => d.id === selectedId) ?? null;

  return (
    <div
      ref={overlayRef}
      className={`pointer-events-none absolute inset-0 z-10 ${
        capturePointer ? "pointer-events-auto" : ""
      } ${tool === "cursor" && selectedId ? "cursor-move" : capturePointer ? "cursor-crosshair" : ""}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <canvas className="pointer-events-none absolute inset-0 h-full w-full" />
      {cursorHint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-subtle/40 bg-surface/90 px-3 py-1.5 text-[11px] text-muted shadow-card backdrop-blur-md animate-fade-in">
          {cursorHint}
          {draft?.a && <span className="ml-2 text-brand">· move, then click to finish</span>}
        </div>
      )}
      {selected && !hidden && (
        <div className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-subtle/50 bg-surface/95 p-1 shadow-pop backdrop-blur-md animate-fade-in">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-faint">
            {selected.kind}
          </span>
          <button
            type="button"
            className="rounded-md bg-bear/15 px-2.5 py-1.5 text-[11px] font-bold text-bear hover:bg-bear/25"
            disabled={locked}
            onClick={(e) => {
              e.stopPropagation();
              if (locked) return;
              remove(symbolId, selected.id);
              setSelectedId(null);
            }}
          >
            Delete
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1.5 text-[11px] font-semibold text-muted hover:bg-elevated"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(null);
            }}
          >
            ✕
          </button>
        </div>
      )}
      {measure && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-brand/30 bg-surface/95 px-4 py-2 font-mono text-sm text-brand shadow-pop animate-scale-in">
          {measure}
        </div>
      )}
      {menu && (
        <div
          className="pointer-events-auto absolute z-30 min-w-[160px] rounded-md border border-subtle/40 bg-surface py-1 text-[11px] shadow-pop"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.hitId && (
            <MenuItem
              label="Delete drawing"
              danger
              onClick={() => {
                if (!locked) {
                  remove(symbolId, menu.hitId!);
                  if (selectedId === menu.hitId) setSelectedId(null);
                }
                setMenu(null);
              }}
            />
          )}
          <MenuItem
            label={`Copy price ${menu.price.toFixed(2)}`}
            onClick={() => {
              void navigator.clipboard?.writeText(menu.price.toFixed(2));
              setMenu(null);
            }}
          />
          <MenuItem
            label="Add horizontal line"
            onClick={() => {
              if (!locked) {
                placeAndSelect({
                  id: drawingId(),
                  kind: "hline",
                  price: menu.price,
                  color: "rgba(94,168,210,0.85)",
                  label: "H",
                });
              }
              setMenu(null);
            }}
          />
          <MenuItem
            label={magnet ? "Magnet: On" : "Magnet: Off"}
            onClick={() => {
              toggleMagnet();
              setMenu(null);
            }}
          />
          <MenuItem
            label={hidden ? "Show drawings" : "Hide drawings"}
            onClick={() => {
              toggleHidden();
              setMenu(null);
            }}
          />
          <MenuItem
            label="Clear drawings"
            danger
            onClick={() => {
              if (!locked && confirm("Clear all drawings?")) {
                clear(symbolId);
                setSelectedId(null);
              }
              setMenu(null);
            }}
          />
          <MenuItem
            label="Select tool"
            onClick={() => {
              setTool("cursor");
              setMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`block w-full px-3 py-1.5 text-left hover:bg-elevated ${danger ? "text-bear" : "text-content"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function distToSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function hitTestDrawings(
  drawings: ChartDrawing[],
  chart: IChartApi,
  series: SeriesLike,
  x: number,
  y: number,
  threshold: number,
): ChartDrawing | null {
  const toXY = (t: number, p: number) => {
    const cx = chart.timeScale().timeToCoordinate(t as Time);
    const cy = series.priceToCoordinate(p);
    return { x: cx as number | null, y: cy as number | null };
  };

  let best: ChartDrawing | null = null;
  let bestDist = threshold;

  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    let dist = Infinity;

    if (d.kind === "hline") {
      const cy = series.priceToCoordinate(d.price);
      if (cy != null) dist = Math.abs(cy - y);
    } else if (d.kind === "vline") {
      const cx = chart.timeScale().timeToCoordinate(d.time as Time);
      if (cx != null) dist = Math.abs(cx - x);
    } else if (d.kind === "text") {
      const p = toXY(d.t, d.p);
      if (p.x != null && p.y != null) dist = Math.hypot(p.x - x, p.y - y);
    } else if (d.kind === "brush") {
      for (let j = 1; j < d.points.length; j++) {
        const a = toXY(d.points[j - 1].t, d.points[j - 1].p);
        const b = toXY(d.points[j].t, d.points[j].p);
        if (a.x == null || a.y == null || b.x == null || b.y == null) continue;
        dist = Math.min(dist, distToSeg(x, y, a.x, a.y, b.x, b.y));
      }
    } else if (d.kind === "rect" || d.kind === "fib") {
      const a = toXY(d.t1, d.p1);
      const b = toXY(d.t2, d.p2);
      if (a.x != null && a.y != null && b.x != null && b.y != null) {
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y, b.y);
        const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const edge = Math.min(
          Math.abs(x - x0),
          Math.abs(x - x1),
          Math.abs(y - y0),
          Math.abs(y - y1),
        );
        dist = inside ? Math.min(edge, threshold - 1) : edge;
        // Fib: also hit near level lines
        if (d.kind === "fib") {
          const top = Math.min(d.p1, d.p2);
          const bot = Math.max(d.p1, d.p2);
          const span = bot - top || 1;
          for (const lv of FIB_LEVELS) {
            const cy = series.priceToCoordinate(bot - span * lv);
            if (cy == null) continue;
            if (x >= x0 - 4 && x <= x1 + 4) dist = Math.min(dist, Math.abs(cy - y));
          }
        }
      }
    } else {
      const a = toXY(d.t1, d.p1);
      const b = toXY(d.t2, d.p2);
      if (a.x != null && a.y != null && b.x != null && b.y != null) {
        if (d.kind === "ray") {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const scale = 4000 / len;
          dist = distToSeg(x, y, a.x, a.y, a.x + dx * scale, a.y + dy * scale);
        } else {
          dist = distToSeg(x, y, a.x, a.y, b.x, b.y);
        }
      }
    }

    if (dist <= bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function paintDrawings(
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  series: SeriesLike,
  drawings: ChartDrawing[],
  draftPreview: {
    tool: string;
    a: { t: number; p: number };
    b: { t: number; p: number };
  } | null = null,
  selectedId: string | null = null,
) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const toXY = (t: number, p: number) => {
    const x = chart.timeScale().timeToCoordinate(t as Time);
    const y = series.priceToCoordinate(p);
    return { x: x as number | null, y: y as number | null };
  };

  const drawSelectionHalo = (x: number, y: number) => {
    ctx.strokeStyle = "rgba(79,124,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(79,124,255,0.2)";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  for (const d of drawings) {
    const selected = d.id === selectedId;
    if (d.kind === "hline") continue;

    if (d.kind === "vline") {
      const x = chart.timeScale().timeToCoordinate(d.time as Time);
      if (x == null) continue;
      ctx.strokeStyle = selected ? "rgba(79,124,255,0.95)" : d.color;
      ctx.lineWidth = selected ? 2 : 1.25;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected) drawSelectionHalo(x, h / 2);
      continue;
    }

    if (d.kind === "text") {
      const { x, y } = toXY(d.t, d.p);
      if (x == null || y == null) continue;
      ctx.fillStyle = selected ? "rgba(79,124,255,0.95)" : d.color;
      ctx.font = "600 11px Sora, system-ui, sans-serif";
      ctx.fillText(d.text, x + 4, y - 4);
      if (selected) drawSelectionHalo(x, y);
      continue;
    }

    if (d.kind === "brush") {
      if (d.points.length < 2) continue;
      ctx.strokeStyle = selected ? "rgba(79,124,255,0.95)" : d.color;
      ctx.lineWidth = selected ? 2.25 : 1.75;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      let started = false;
      for (const pt of d.points) {
        const { x, y } = toXY(pt.t, pt.p);
        if (x == null || y == null) continue;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      continue;
    }

    const a = toXY(d.t1, d.p1);
    const b = toXY(d.t2, d.p2);
    if (a.x == null || a.y == null || b.x == null || b.y == null) continue;

    if (d.kind === "position") {
      paintPosition(ctx, series, a, b, d.side, d.t1, d.p1, d.t2, d.p2, selected);
      continue;
    }

    if (d.kind === "rect") {
      ctx.fillStyle = d.color.includes("rgba") ? d.color : "rgba(94,168,210,0.12)";
      ctx.strokeStyle = selected ? "rgba(79,124,255,0.95)" : "rgba(94,168,210,0.55)";
      ctx.lineWidth = selected ? 2 : 1;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      if (selected) {
        drawSelectionHalo(a.x, a.y);
        drawSelectionHalo(b.x, b.y);
      }
      continue;
    }

    if (d.kind === "fib") {
      const top = Math.min(d.p1, d.p2);
      const bot = Math.max(d.p1, d.p2);
      const span = bot - top || 1;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      for (const lv of FIB_LEVELS) {
        const price = bot - span * lv;
        const y = series.priceToCoordinate(price);
        if (y == null) continue;
        const hi = FIB_HIGHLIGHT.has(lv);
        ctx.strokeStyle = hi
          ? selected
            ? "rgba(79,124,255,0.95)"
            : "rgba(214,160,72,0.95)"
          : `rgba(214,160,72,${0.28 + lv * 0.28})`;
        ctx.lineWidth = hi ? 2.5 : 1;
        if (hi) ctx.setLineDash([]);
        else ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = hi ? "rgba(214,160,72,1)" : "rgba(214,160,72,0.7)";
        ctx.font = hi
          ? '700 12px "IBM Plex Mono", monospace'
          : '500 10px "IBM Plex Mono", monospace';
        const label = lv === 0 || lv === 1 ? lv.toFixed(0) : lv.toFixed(lv === 0.6 ? 1 : 3);
        ctx.fillText(hi ? `${label} ★` : label, x1 + 4, y + 4);
      }
      if (selected) {
        drawSelectionHalo(a.x, a.y);
        drawSelectionHalo(b.x, b.y);
      }
      continue;
    }

    ctx.strokeStyle = selected ? "rgba(79,124,255,0.95)" : d.color;
    ctx.lineWidth = selected ? 2.25 : 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    if (d.kind === "ray") {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const scale = Math.max(w, h) / len;
      ctx.lineTo(a.x + dx * scale, a.y + dy * scale);
    } else {
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    if (d.kind === "arrow") {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = 10;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(angle - 0.4), b.y - head * Math.sin(angle - 0.4));
      ctx.lineTo(b.x - head * Math.cos(angle + 0.4), b.y - head * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = selected ? "rgba(79,124,255,0.95)" : d.color;
      ctx.fill();
    }

    if (selected) {
      drawSelectionHalo(a.x, a.y);
      drawSelectionHalo(b.x, b.y);
    } else {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (draftPreview) {
    const a = toXY(draftPreview.a.t, draftPreview.a.p);
    const b = toXY(draftPreview.b.t, draftPreview.b.p);
    if (a.x != null && a.y != null) {
      ctx.fillStyle = "rgba(79,124,255,0.95)";
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(79,124,255,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (a.x != null && a.y != null && b.x != null && b.y != null) {
      const tool = draftPreview.tool;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(79,124,255,0.85)";
      ctx.lineWidth = 1.75;
      if (tool === "long" || tool === "short") {
        paintPosition(
          ctx,
          series,
          a,
          b,
          tool,
          draftPreview.a.t,
          draftPreview.a.p,
          draftPreview.b.t,
          draftPreview.b.p,
          true,
        );
      } else if (tool === "rect") {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        ctx.fillStyle = "rgba(79,124,255,0.08)";
        ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      } else if (tool === "fib") {
        const top = Math.min(draftPreview.a.p, draftPreview.b.p);
        const bot = Math.max(draftPreview.a.p, draftPreview.b.p);
        const span = bot - top || 1;
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        for (const lv of FIB_LEVELS) {
          const price = bot - span * lv;
          const y = series.priceToCoordinate(price);
          if (y == null) continue;
          const hi = FIB_HIGHLIGHT.has(lv);
          ctx.lineWidth = hi ? 2.25 : 1.25;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        if (tool === "ray") {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const scale = Math.max(w, h) / len;
          ctx.lineTo(a.x + dx * scale, a.y + dy * scale);
        } else {
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(79,124,255,0.9)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function timeToSeconds(time: Time): number | null {
  if (typeof time === "number" && Number.isFinite(time)) return time;
  if (time && typeof time === "object" && "year" in time && "month" in time && "day" in time) {
    return Date.UTC(time.year, time.month - 1, time.day) / 1000;
  }
  return null;
}

function makeTwoPointDrawing(
  tool: string,
  a: { t: number; p: number },
  b: { t: number; p: number },
): ChartDrawing {
  if (tool === "long" || tool === "short") {
    return {
      id: drawingId(),
      kind: "position",
      side: tool,
      t1: a.t,
      p1: a.p,
      t2: b.t,
      p2: b.p,
      color: tool === "long" ? "rgba(52,186,122,0.9)" : "rgba(232,92,92,0.9)",
    };
  }
  const color =
    tool === "fib"
      ? "rgba(214,160,72,0.75)"
      : tool === "rect"
        ? "rgba(94,168,210,0.35)"
        : "rgba(94,168,210,0.9)";
  if (tool === "rect") return { id: drawingId(), kind: "rect", t1: a.t, p1: a.p, t2: b.t, p2: b.p, color };
  if (tool === "fib") return { id: drawingId(), kind: "fib", t1: a.t, p1: a.p, t2: b.t, p2: b.p, color };
  if (tool === "arrow") return { id: drawingId(), kind: "arrow", t1: a.t, p1: a.p, t2: b.t, p2: b.p, color };
  return {
    id: drawingId(),
    kind: tool === "ray" ? "ray" : "trendline",
    t1: a.t,
    p1: a.p,
    t2: b.t,
    p2: b.p,
    color,
  };
}

function positionLevels(side: "long" | "short", entry: number, other: number) {
  const minRisk = Math.max(Math.abs(entry) * 0.0008, 0.01);
  if (side === "long") {
    if (other >= entry) {
      const target = Math.max(other, entry + minRisk);
      return { entry, target, stop: entry - (target - entry) };
    }
    const stop = Math.min(other, entry - minRisk);
    return { entry, stop, target: entry + (entry - stop) * 2 };
  }
  if (other <= entry) {
    const target = Math.min(other, entry - minRisk);
    return { entry, target, stop: entry + (entry - target) };
  }
  const stop = Math.max(other, entry + minRisk);
  return { entry, stop, target: entry - (stop - entry) * 2 };
}

function paintPosition(
  ctx: CanvasRenderingContext2D,
  series: SeriesLike,
  a: { x: number | null; y: number | null },
  b: { x: number | null; y: number | null },
  side: "long" | "short",
  _t1: number,
  p1: number,
  _t2: number,
  p2: number,
  selected: boolean,
) {
  if (a.x == null || b.x == null) return;
  const box = positionLevels(side, p1, p2);
  const yEntry = series.priceToCoordinate(box.entry);
  const yTarget = series.priceToCoordinate(box.target);
  const yStop = series.priceToCoordinate(box.stop);
  if (yEntry == null || yTarget == null || yStop == null) return;
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x, x0 + 48);
  const profit = side === "long" ? "rgba(52,186,122,0.18)" : "rgba(232,92,92,0.18)";
  const risk = side === "long" ? "rgba(232,92,92,0.16)" : "rgba(52,186,122,0.16)";
  ctx.fillStyle = profit;
  ctx.fillRect(x0, Math.min(yEntry, yTarget), x1 - x0, Math.abs(yTarget - yEntry));
  ctx.fillStyle = risk;
  ctx.fillRect(x0, Math.min(yEntry, yStop), x1 - x0, Math.abs(yStop - yEntry));
  ctx.strokeStyle = selected ? "rgba(79,124,255,0.95)" : side === "long" ? "rgba(52,186,122,0.95)" : "rgba(232,92,92,0.95)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, yEntry);
  ctx.lineTo(x1, yEntry);
  ctx.stroke();
  ctx.font = '700 11px "IBM Plex Mono", monospace';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillText(side === "long" ? "LONG" : "SHORT", x0 + 6, yEntry - 6);
  ctx.font = '500 10px "IBM Plex Mono", monospace';
  ctx.fillText(box.entry.toFixed(2), x1 + 4, yEntry + 3);
}
