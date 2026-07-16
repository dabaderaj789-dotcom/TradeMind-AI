import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { annotationCaption, type ChartAnnotation } from "../../lib/decision";
import type { PredictivePlan } from "../../lib/predictiveSignal";
import { isNum, num } from "../../lib/format";
import {
  declutterMarkers,
  markerPriority,
  selectActiveOrderBlocks,
  selectAnnotations,
  selectCurrentStructure,
  selectCurrentSweeps,
  selectFreshFvgs,
  selectTradePlan,
} from "../../lib/chartQuality";
import { useSettings } from "../../store/settings";
import type { OverlayId } from "../../lib/overlays";
import type {
  AnalysisBar,
  Candle,
  Fvg,
  Levels,
  LiquiditySweep,
  MarketQuote,
  OrderBlock,
  StructureEvents,
  TradeSetup,
} from "../../lib/types";

export interface OverlayData {
  ema?: AnalysisBar[];
  sma?: AnalysisBar[];
  vwap?: AnalysisBar[];
  quote?: MarketQuote | null;
  orderBlocks?: OrderBlock[];
  fvgs?: Fvg[];
  sweeps?: LiquiditySweep[];
  levels?: Levels | null;
  events?: StructureEvents | null;
  setups?: TradeSetup[];
  annotations?: ChartAnnotation[];
  predictive?: PredictivePlan | null;
}

interface Props {
  candles: Candle[];
  enabled: Record<OverlayId, boolean>;
  data: OverlayData;
}

const toTime = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

function toLineData(bars: AnalysisBar[] | undefined, key: string): LineData[] {
  if (!bars) return [];
  return bars
    .filter((b) => isNum(b.values[key]))
    .map((b) => ({ time: toTime(b.open_time), value: num(b.values[key]) }))
    .sort((a, b) => (a.time as number) - (b.time as number));
}

function nearestCandleTime(candles: Candle[], iso: string): UTCTimestamp {
  const target = new Date(iso).getTime();
  if (!candles.length) return toTime(iso);
  let best = candles[0];
  let bestDiff = Math.abs(new Date(best.open_time).getTime() - target);
  for (const c of candles) {
    const d = Math.abs(new Date(c.open_time).getTime() - target);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return toTime(best.open_time);
}

export function TerminalChart({ candles, enabled, data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lineRefs = useRef<Partial<Record<"ema" | "sma" | "vwap", ISeriesApi<"Line">>>>({});
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const candlesRef = useRef<Candle[]>(candles);
  candlesRef.current = candles;
  const showHistorical = useSettings((s) => s.showHistoricalOverlays);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(148,163,184,0.95)",
        fontFamily: '"IBM Plex Sans", Inter, system-ui, sans-serif',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.045)" },
        horzLines: { color: "rgba(148,163,184,0.045)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(79,124,255,0.35)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1a2134" },
        horzLine: { color: "rgba(79,124,255,0.35)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1a2134" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.1)", scaleMargins: { top: 0.08, bottom: 0.16 } },
      timeScale: { borderColor: "rgba(148,163,184,0.1)", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#4ade80",
      wickDownColor: "#f87171",
    });
    const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      lineRefs.current = {};
      priceLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    const sorted = [...candles].sort((a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime());
    const candleData: CandlestickData[] = sorted.map((c) => ({
      time: toTime(c.open_time),
      open: num(c.open),
      high: num(c.high),
      low: num(c.low),
      close: num(c.close),
    }));
    const volumeData: HistogramData[] = sorted.map((c) => ({
      time: toTime(c.open_time),
      value: num(c.volume),
      color: num(c.close) >= num(c.open) ? "rgba(34,197,94,0.32)" : "rgba(239,68,68,0.32)",
    }));
    candleRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);
    // Fit once when the series length changes materially — not on every live tip refresh.
    const prevLen = (candleRef.current as unknown as { __tmLen?: number }).__tmLen ?? 0;
    if (candleData.length && Math.abs(candleData.length - prevLen) > 2) {
      chartRef.current?.timeScale().fitContent();
    }
    (candleRef.current as unknown as { __tmLen?: number }).__tmLen = candleData.length;
  }, [candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const configs: Array<{ id: "ema" | "sma" | "vwap"; key: string; color: string }> = [
      { id: "ema", key: "ema", color: "#f59e0b" },
      { id: "sma", key: "sma", color: "#38bdf8" },
      { id: "vwap", key: "vwap", color: "#a855f7" },
    ];
    for (const cfg of configs) {
      const on = enabled[cfg.id];
      const points = on ? toLineData(data[cfg.id], cfg.key) : [];
      const existing = lineRefs.current[cfg.id];
      if (on && points.length) {
        if (existing) {
          existing.setData(points);
        } else {
          const s = chart.addLineSeries({
            color: cfg.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          s.setData(points);
          lineRefs.current[cfg.id] = s;
        }
      } else if (existing) {
        chart.removeSeries(existing);
        delete lineRefs.current[cfg.id];
      }
    }
  }, [enabled, data]);

  // Markers: current BOS / CHoCH / AI decision only (decluttered).
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    const markers: Array<SeriesMarker<Time> & { priority?: number }> = [];
    const bars = candlesRef.current;
    const structure = selectCurrentStructure(data.events, showHistorical);

    if (enabled.bos) {
      for (const e of structure.bos_events) {
        const up = e.break_price >= e.broken_swing_price;
        const text = "BOS";
        markers.push({
          time: nearestCandleTime(bars, e.break_time),
          position: up ? "belowBar" : "aboveBar",
          color: up ? "#22c55e" : "#ef4444",
          shape: up ? "arrowUp" : "arrowDown",
          text,
          priority: markerPriority(text),
        });
      }
    }
    if (enabled.choch) {
      for (const e of structure.choch_events) {
        const up = e.break_price >= e.broken_swing_price;
        const text = "CHoCH";
        markers.push({
          time: nearestCandleTime(bars, e.break_time),
          position: up ? "belowBar" : "aboveBar",
          color: "#fbbf24",
          shape: "circle",
          text,
          priority: markerPriority(text),
        });
      }
    }

    if (enabled.tradeSetups) {
      for (const a of selectAnnotations(data.annotations)) {
        const time = nearestCandleTime(bars, a.time);
        const text = annotationCaption(a);
        if (a.side === "buy") {
          markers.push({
            time,
            position: "belowBar",
            color: "#22c55e",
            shape: "arrowUp",
            text,
            priority: markerPriority(text),
          });
        } else if (a.side === "sell") {
          markers.push({
            time,
            position: "aboveBar",
            color: "#ef4444",
            shape: "arrowDown",
            text,
            priority: markerPriority(text),
          });
        }
      }
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    const cleaned = declutterMarkers(markers, 3) as SeriesMarker<Time>[];
    series.setMarkers(cleaned);
  }, [enabled, data, candles, showHistorical]);

  // Price lines: one active OB, one fresh FVG, current trade plan.
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const l of priceLinesRef.current) series.removePriceLine(l);
    priceLinesRef.current = [];

    const add = (
      price: number,
      color: string,
      title: string,
      style: LineStyle = LineStyle.Solid,
      width: 1 | 2 | 3 | 4 = 1,
    ) => {
      if (!isNum(price) || price <= 0) return;
      priceLinesRef.current.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: width,
          lineStyle: style,
          axisLabelVisible: true,
          title,
        }),
      );
    };

    if (enabled.marketStructure && showHistorical) {
      for (const s of (data.levels?.support_levels ?? []).slice(0, 2)) {
        add(num(s.price), "rgba(34,197,94,0.7)", "Support", LineStyle.Dashed);
      }
      for (const r of (data.levels?.resistance_levels ?? []).slice(0, 2)) {
        add(num(r.price), "rgba(239,68,68,0.7)", "Resistance", LineStyle.Dashed);
      }
    }

    if (enabled.orderBlocks) {
      for (const ob of selectActiveOrderBlocks(data.orderBlocks, showHistorical)) {
        const bull = ob.type.toLowerCase().includes("bull");
        const c = bull ? "rgba(34,197,94,0.75)" : "rgba(168,85,247,0.8)";
        add(num(ob.zone_high), c, bull ? "OB High" : "OB High", LineStyle.Dotted, 2);
        add(num(ob.zone_low), c, bull ? "Bull OB" : "Bear OB", LineStyle.Dotted, 2);
      }
    }

    if (enabled.fvg) {
      for (const g of selectFreshFvgs(data.fvgs, showHistorical)) {
        const bull = g.type.toLowerCase().includes("bull");
        const c = bull ? "rgba(34,211,238,0.85)" : "rgba(56,189,248,0.8)";
        add(num(g.gap_high), c, "", LineStyle.SparseDotted, 2);
        add(num(g.gap_low), c, bull ? "Bull FVG" : "Bear FVG", LineStyle.SparseDotted, 2);
      }
    }

    if (enabled.sweeps) {
      for (const s of selectCurrentSweeps(data.sweeps, showHistorical)) {
        const bull = s.type.toLowerCase().includes("bull");
        add(
          num(s.sweep_level),
          bull ? "rgba(250,204,21,0.9)" : "rgba(244,114,182,0.9)",
          "Sweep",
          LineStyle.LargeDashed,
          2,
        );
      }
    }

    if (enabled.priceReferences && data.quote) {
      const q = data.quote;
      add(q.current_price, "rgba(79,124,255,0.95)", "Last", LineStyle.Solid, 2);
      add(q.day_high, "rgba(34,197,94,0.75)", "Day High", LineStyle.Dashed, 1);
      add(q.day_low, "rgba(239,68,68,0.75)", "Day Low", LineStyle.Dashed, 1);
      add(q.prev_day_high, "rgba(34,197,94,0.45)", "Prev High", LineStyle.Dotted, 1);
      add(q.prev_day_low, "rgba(239,68,68,0.45)", "Prev Low", LineStyle.Dotted, 1);
      add(q.prev_close, "rgba(148,163,184,0.85)", "Prev Close", LineStyle.LargeDashed, 1);
      add(q.day_open, "rgba(250,204,21,0.85)", "Open", LineStyle.Solid, 1);
      add(q.vwap, "rgba(168,85,247,0.9)", "VWAP", LineStyle.Solid, 2);
    }

    if (enabled.tradeSetups) {
      const { predictive: plan, setup: top } = selectTradePlan(data.predictive, data.setups);
      if (plan) {
        const buy = plan.direction === "buy";
        add(plan.entryHigh, buy ? "rgba(34,197,94,0.85)" : "rgba(239,68,68,0.85)", buy ? "Buy Zone" : "Sell Zone", LineStyle.Solid, 2);
        add(plan.entryLow, buy ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)", "", LineStyle.Dotted, 1);
        add(plan.entry, "#4f7cff", "Entry", LineStyle.Solid, 2);
        add(plan.stop, "#ef4444", "SL", LineStyle.Solid, 2);
        add(plan.target1, "rgba(56,189,248,0.95)", "TP1", LineStyle.Solid, 2);
        if (plan.target2 != null) add(plan.target2, "rgba(56,189,248,0.65)", "TP2", LineStyle.Dashed, 1);
      } else if (top) {
        add(num(top.entry_zone.low), "#4f7cff", "Entry", LineStyle.Solid, 2);
        add(num(top.entry_zone.high), "rgba(79,124,255,0.45)", "Zone", LineStyle.Dotted);
        add(num(top.stop_loss_zone.low), "#ef4444", "SL", LineStyle.Solid, 2);
        const t1 = top.target_zones[0];
        if (t1) add(num(t1.low), "#22c55e", "TP1", LineStyle.Solid, 2);
      }
    }
  }, [enabled, data, showHistorical]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {enabled.tradeSetups && data.predictive && <PlanHud plan={data.predictive} />}
      {enabled.tradeSetups && !data.predictive && (data.annotations?.length ?? 0) > 0 && (
        <AnnotationLegend annotations={data.annotations!.slice(-3).reverse()} />
      )}
    </div>
  );
}

function PlanHud({ plan }: { plan: PredictivePlan }) {
  const buy = plan.direction === "buy";
  return (
    <div className="pointer-events-none absolute left-3 top-3 max-w-[280px]">
      <div
        className={`rounded-xl border backdrop-blur-md px-3 py-2.5 shadow-pop ${
          buy ? "border-bull/30 bg-surface/90" : "border-bear/30 bg-surface/90"
        }`}
      >
        <div className={`text-[11px] font-bold tracking-wide ${buy ? "text-bull" : "text-bear"}`}>
          {plan.label} · {Math.round(plan.confidence)}%
        </div>
        <div className="mt-1 text-[10px] text-muted">
          {plan.state} · {plan.setupType}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
          <span className="text-faint">Entry</span>
          <span className="text-brand text-right">{plan.entry}</span>
          <span className="text-faint">Stop</span>
          <span className="text-bear text-right">{plan.stop}</span>
          <span className="text-faint">TP1</span>
          <span className="text-info text-right">{plan.target1}</span>
          {plan.target2 != null && (
            <>
              <span className="text-faint">TP2</span>
              <span className="text-info text-right">{plan.target2}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AnnotationLegend({ annotations }: { annotations: ChartAnnotation[] }) {
  return (
    <div className="pointer-events-none absolute left-3 bottom-3 flex flex-col gap-1.5 max-w-[320px]">
      {annotations.map((a) => {
        const color =
          a.side === "buy" ? "text-bull border-bull/30 bg-bull/10" : a.side === "sell" ? "text-bear border-bear/30 bg-bear/10" : "text-warn border-warn/30 bg-warn/10";
        return (
          <div
            key={`${a.time}-${a.side}-${a.setupType}`}
            className={`rounded-lg border backdrop-blur-md px-2.5 py-1.5 text-[11px] ${color}`}
          >
            <div className="font-semibold tracking-wide">
              {a.label} · {Math.round(a.confidence)}%
            </div>
            <div className="opacity-90 truncate">
              {a.setupType} · {a.strategy}
            </div>
            <div className="opacity-70 text-[10px] font-mono">
              {new Date(a.timestamp).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
