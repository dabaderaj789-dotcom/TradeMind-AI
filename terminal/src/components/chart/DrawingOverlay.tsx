/**
 * Chart drawing interaction layer — horizontal / trend / fib / rect / eraser.
 * Uses Lightweight Charts coordinate conversion. Presentation only.
 */

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { drawingId, useDrawings, type ChartDrawing } from "../../store/drawings";
import { useWorkspace } from "../../store/workspace";
import { LineStyle, type IPriceLine } from "lightweight-charts";

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

interface Props {
  symbolId: string;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
}

export function DrawingOverlay({ symbolId, chart, series }: Props) {
  const tool = useWorkspace((s) => s.drawingTool);
  const drawings = useDrawings((s) => s.bySymbol[symbolId] ?? []);
  const add = useDrawings((s) => s.add);
  const draft = useDrawings((s) => s.draft);
  const setDraft = useDrawings((s) => s.setDraft);
  const removeNearest = useDrawings((s) => s.removeNearest);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hLinesRef = useRef<IPriceLine[]>([]);
  const [measure, setMeasure] = useState<string | null>(null);
  const [cursorHint, setCursorHint] = useState<string | null>(null);

  // Sync horizontal price lines onto the series.
  useEffect(() => {
    if (!series) return;
    for (const l of hLinesRef.current) series.removePriceLine(l);
    hLinesRef.current = [];
    for (const d of drawings) {
      if (d.kind !== "hline") continue;
      hLinesRef.current.push(
        series.createPriceLine({
          price: d.price,
          color: d.color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: d.label ?? "H",
        }),
      );
    }
  }, [drawings, series, chart]);

  // Paint canvas drawings (trend/rect/fib/text) on resize / zoom.
  useEffect(() => {
    if (!chart || !series || !overlayRef.current) return;
    const canvas = overlayRef.current.querySelector("canvas");
    if (!canvas) return;
    const paint = () => paintDrawings(canvas, chart, series, drawings);
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(overlayRef.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange(paint);
    return () => {
      ro.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(paint);
      } catch {
        /* chart may be disposed */
      }
    };
  }, [chart, series, drawings]);

  useEffect(() => {
    if (tool === "cursor" || tool === "crosshair") {
      setCursorHint(null);
      return;
    }
    const hints: Record<string, string> = {
      hline: "Click to place horizontal line",
      trendline: "Click two points for trend line",
      ray: "Click two points for ray",
      rect: "Click two corners for rectangle",
      fib: "Click swing high then low (or reverse)",
      text: "Click to place a note",
      measure: "Click two points to measure",
      eraser: "Click near a drawing to remove it",
    };
    setCursorHint(hints[tool] ?? null);
  }, [tool]);

  const active = tool !== "cursor" && tool !== "crosshair";

  const onClick = (e: React.MouseEvent) => {
    if (!active || !chart || !series || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = chart.timeScale().coordinateToTime(x) as Time | null;
    const price = series.coordinateToPrice(y);
    if (time == null || price == null || !Number.isFinite(price as number)) return;
    const t = typeof time === "number" ? time : 0;
    const p = price as number;

    if (tool === "eraser") {
      removeNearest(symbolId, p, t);
      return;
    }
    if (tool === "hline") {
      add(symbolId, {
        id: drawingId(),
        kind: "hline",
        price: p,
        color: "rgba(94,168,210,0.85)",
        label: "H",
      });
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Annotation text", "Note");
      if (!text) return;
      add(symbolId, {
        id: drawingId(),
        kind: "text",
        t,
        p,
        text,
        color: "rgba(232,234,239,0.9)",
      });
      return;
    }

    const twoPoint = tool === "trendline" || tool === "ray" || tool === "rect" || tool === "fib" || tool === "measure";
    if (!twoPoint) return;

    if (!draft?.a) {
      setDraft({ tool, a: { t, p } });
      return;
    }

    const a = draft.a;
    if (tool === "measure") {
      const pct = ((p - a.p) / Math.max(Math.abs(a.p), 1e-9)) * 100;
      setMeasure(`${(p - a.p).toFixed(2)}  ·  ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`);
      setTimeout(() => setMeasure(null), 3500);
      setDraft(null);
      return;
    }

    const color =
      tool === "fib"
        ? "rgba(214,160,72,0.75)"
        : tool === "rect"
          ? "rgba(94,168,210,0.35)"
          : "rgba(94,168,210,0.9)";

    const d: ChartDrawing =
      tool === "rect"
        ? { id: drawingId(), kind: "rect", t1: a.t, p1: a.p, t2: t, p2: p, color }
        : tool === "fib"
          ? { id: drawingId(), kind: "fib", t1: a.t, p1: a.p, t2: t, p2: p, color }
          : {
              id: drawingId(),
              kind: tool === "ray" ? "ray" : "trendline",
              t1: a.t,
              p1: a.p,
              t2: t,
              p2: p,
              color,
            };
    add(symbolId, d);
    setDraft(null);
  };

  return (
    <div
      ref={overlayRef}
      className={`pointer-events-none absolute inset-0 z-10 ${active ? "pointer-events-auto cursor-crosshair" : ""}`}
      onClick={onClick}
    >
      <canvas className="pointer-events-none absolute inset-0 h-full w-full" />
      {cursorHint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-subtle/40 bg-surface/90 px-3 py-1.5 text-[11px] text-muted shadow-card backdrop-blur-md animate-fade-in">
          {cursorHint}
          {draft?.a && <span className="ml-2 text-brand">· click second point</span>}
        </div>
      )}
      {measure && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-brand/30 bg-surface/95 px-4 py-2 font-mono text-sm text-brand shadow-pop animate-scale-in">
          {measure}
        </div>
      )}
    </div>
  );
}

function paintDrawings(
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  drawings: ChartDrawing[],
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

  for (const d of drawings) {
    if (d.kind === "hline") continue;
    if (d.kind === "text") {
      const { x, y } = toXY(d.t, d.p);
      if (x == null || y == null) continue;
      ctx.fillStyle = d.color;
      ctx.font = "600 11px Sora, system-ui, sans-serif";
      ctx.fillText(d.text, x + 4, y - 4);
      continue;
    }

    const a = toXY(d.t1, d.p1);
    const b = toXY(d.t2, d.p2);
    if (a.x == null || a.y == null || b.x == null || b.y == null) continue;

    if (d.kind === "rect") {
      ctx.fillStyle = d.color.includes("rgba") ? d.color : "rgba(94,168,210,0.12)";
      ctx.strokeStyle = "rgba(94,168,210,0.55)";
      ctx.lineWidth = 1;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
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
        ctx.strokeStyle = `rgba(214,160,72,${0.35 + lv * 0.35})`;
        ctx.lineWidth = lv === 0 || lv === 1 || lv === 0.5 ? 1.25 : 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(214,160,72,0.85)";
        ctx.font = "10px IBM Plex Mono, monospace";
        ctx.fillText(lv.toFixed(3), x1 + 4, y + 3);
      }
      continue;
    }

    // trendline / ray
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 1.5;
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
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (d.kind === "trendline") {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
