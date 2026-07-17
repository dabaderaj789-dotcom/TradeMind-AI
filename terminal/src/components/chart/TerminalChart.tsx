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
import { useEffect, useRef, useState } from "react";
import type { ChartAnnotation } from "../../lib/decision";
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
  selectNearestLevels,
  selectTradePlan,
} from "../../lib/chartQuality";
import { useSettings } from "../../store/settings";
import { ZonesPrimitive, type PriceZone } from "./zonesPrimitive";
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
  /** Recent HH/HL/LH/LL swings from market_structure analysis. */
  swings?: { time: string; type: string }[];
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
  const zonesRef = useRef<ZonesPrimitive | null>(null);
  const candlesRef = useRef<Candle[]>(candles);
  const [chartGeneration, setChartGeneration] = useState(0);
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
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });

    const zones = new ZonesPrimitive();
    candleSeries.attachPrimitive(zones);

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    zonesRef.current = zones;
    // Replay data/overlay effects after the imperative chart refs exist.
    // This also covers React StrictMode's setup → cleanup → setup lifecycle.
    setChartGeneration((generation) => generation + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      zonesRef.current = null;
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
      color: num(c.close) >= num(c.open) ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
    }));
    candleRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);
    // Fit once when the series length changes materially — not on every live tip refresh.
    const prevLen = (candleRef.current as unknown as { __tmLen?: number }).__tmLen ?? 0;
    if (candleData.length && Math.abs(candleData.length - prevLen) > 2) {
      chartRef.current?.timeScale().fitContent();
    }
    (candleRef.current as unknown as { __tmLen?: number }).__tmLen = candleData.length;
  }, [candles, chartGeneration]);

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
  }, [enabled, data, chartGeneration]);

  // Markers: current BOS / CHoCH / AI decision only (decluttered).
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    const markers: Array<SeriesMarker<Time> & { priority?: number }> = [];
    const bars = candlesRef.current;
    const structure = selectCurrentStructure(data.events, showHistorical);

    // Structure events — quiet text captions, no arrows. Price action stays primary.
    if (enabled.bos) {
      for (const e of structure.bos_events) {
        const up = e.break_price >= e.broken_swing_price;
        const text = "BOS";
        markers.push({
          time: nearestCandleTime(bars, e.break_time),
          position: up ? "belowBar" : "aboveBar",
          color: up ? "rgba(134,239,172,0.6)" : "rgba(252,165,165,0.6)",
          shape: up ? "arrowUp" : "arrowDown",
          size: 0,
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
          color: "rgba(251,191,36,0.65)",
          shape: "circle",
          size: 0,
          text,
          priority: markerPriority(text),
        });
      }
    }

    // Active structure swings only (last few HH/HL/LH/LL) — muted, text-only.
    if (enabled.marketStructure && data.swings?.length) {
      const recent = showHistorical ? data.swings.slice(-6) : data.swings.slice(-3);
      for (const s of recent) {
        const high = s.type === "HH" || s.type === "LH";
        markers.push({
          time: nearestCandleTime(bars, s.time),
          position: high ? "aboveBar" : "belowBar",
          color: s.type.startsWith("H") ? "rgba(134,239,172,0.5)" : "rgba(252,165,165,0.5)",
          shape: "square",
          size: 0,
          text: s.type,
          priority: 25,
        });
      }
    }

    // AI trade signal — only ever painted for an actionable BUY/SELL decision,
    // anchored at the confirmation candle. WAIT never produces a marker.
    if (enabled.tradeSetups) {
      for (const a of selectAnnotations(data.annotations)) {
        const time = nearestCandleTime(bars, a.time);
        const text = `${a.label} ${Math.round(a.confidence)}%`;
        if (a.side === "buy") {
          markers.push({
            time,
            position: "belowBar",
            color: "#22c55e",
            shape: "arrowUp",
            size: 2,
            text,
            priority: markerPriority(text),
          });
        } else if (a.side === "sell") {
          markers.push({
            time,
            position: "aboveBar",
            color: "#ef4444",
            shape: "arrowDown",
            size: 2,
            text,
            priority: markerPriority(text),
          });
        }
      }
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    const cleaned = declutterMarkers(markers, 3) as SeriesMarker<Time>[];
    series.setMarkers(cleaned);
  }, [enabled, data, candles, showHistorical, chartGeneration]);

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

    // Nearest S/R — hairline dashed levels, muted.
    if (enabled.marketStructure) {
      const lastPx =
        data.quote?.current_price ??
        (candlesRef.current.length ? num(candlesRef.current[candlesRef.current.length - 1].close) : null);
      const { support, resistance } = selectNearestLevels(data.levels, lastPx);
      if (support != null) add(support, "rgba(34,197,94,0.5)", "Support", LineStyle.Dashed, 1);
      if (resistance != null) add(resistance, "rgba(239,68,68,0.5)", "Resistance", LineStyle.Dashed, 1);
    }

    // OB + FVG are shaded zones (see zones effect) — no label lines here.

    if (enabled.sweeps) {
      for (const s of selectCurrentSweeps(data.sweeps, showHistorical)) {
        const bull = s.type.toLowerCase().includes("bull");
        add(
          num(s.sweep_level),
          bull ? "rgba(250,204,21,0.55)" : "rgba(244,114,182,0.55)",
          "Sweep",
          LineStyle.SparseDotted,
          1,
        );
      }
    }

    if (enabled.priceReferences && data.quote) {
      const q = data.quote;
      add(q.current_price, "rgba(79,124,255,0.9)", "Last", LineStyle.Solid, 1);
      add(q.day_high, "rgba(34,197,94,0.4)", "Day High", LineStyle.Dotted, 1);
      add(q.day_low, "rgba(239,68,68,0.4)", "Day Low", LineStyle.Dotted, 1);
      add(q.prev_close, "rgba(148,163,184,0.5)", "Prev Close", LineStyle.LargeDashed, 1);
      add(q.vwap, "rgba(168,85,247,0.6)", "VWAP", LineStyle.Solid, 1);
    }

    if (enabled.tradeSetups) {
      const { predictive: plan } = selectTradePlan(data.predictive, data.setups);
      // WAIT / no actionable plan → draw nothing.
      if (plan) {
        add(plan.entry, "#4f7cff", "Entry", LineStyle.Solid, 2);
        add(plan.stop, "rgba(239,68,68,0.9)", "Stop", LineStyle.Solid, 1);
        add(plan.target1, "rgba(56,189,248,0.9)", "TP1", LineStyle.Solid, 1);
        if (plan.target2 != null) add(plan.target2, "rgba(56,189,248,0.6)", "TP2", LineStyle.Dashed, 1);
        if (plan.target3 != null) add(plan.target3, "rgba(56,189,248,0.4)", "TP3", LineStyle.Dotted, 1);
      }
    }
  }, [enabled, data, showHistorical, chartGeneration]);

  // Shaded zones: Order Blocks + FVG + entry zone as quiet rectangles.
  useEffect(() => {
    const zonesApi = zonesRef.current;
    if (!zonesApi) return;
    const bars = candlesRef.current;
    const zones: PriceZone[] = [];

    if (enabled.orderBlocks) {
      for (const ob of selectActiveOrderBlocks(data.orderBlocks, showHistorical)) {
        const bull = ob.type.toLowerCase().includes("bull");
        zones.push({
          id: `ob-${ob.order_block_id}`,
          priceHigh: num(ob.zone_high),
          priceLow: num(ob.zone_low),
          timeStart: bars.length ? nearestCandleTime(bars, ob.created_at) : null,
          fillColor: bull ? "rgba(34,197,94,0.08)" : "rgba(168,85,247,0.08)",
          borderColor: bull ? "rgba(34,197,94,0.28)" : "rgba(168,85,247,0.28)",
          label: bull ? "OB · Demand" : "OB · Supply",
          labelColor: bull ? "rgba(134,239,172,0.75)" : "rgba(216,180,254,0.75)",
        });
      }
    }

    if (enabled.fvg) {
      for (const g of selectFreshFvgs(data.fvgs, showHistorical)) {
        const bull = g.type.toLowerCase().includes("bull");
        zones.push({
          id: `fvg-${g.fvg_id}`,
          priceHigh: num(g.gap_high),
          priceLow: num(g.gap_low),
          timeStart: bars.length ? nearestCandleTime(bars, g.created_at) : null,
          fillColor: bull ? "rgba(34,211,238,0.06)" : "rgba(56,189,248,0.06)",
          borderColor: bull ? "rgba(34,211,238,0.22)" : "rgba(56,189,248,0.22)",
          label: "FVG",
          labelColor: "rgba(165,243,252,0.7)",
        });
      }
    }

    if (enabled.tradeSetups) {
      const { predictive: plan } = selectTradePlan(data.predictive, data.setups);
      if (plan) {
        const buy = plan.direction === "buy";
        zones.push({
          id: "entry-zone",
          priceHigh: Math.max(plan.entryLow, plan.entryHigh),
          priceLow: Math.min(plan.entryLow, plan.entryHigh),
          timeStart: null,
          fillColor: buy ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
          borderColor: buy ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
          label: buy ? "Buy Zone" : "Sell Zone",
          labelColor: buy ? "rgba(134,239,172,0.8)" : "rgba(252,165,165,0.8)",
        });
      }
    }

    zonesApi.setZones(zones);
  }, [enabled, data, candles, showHistorical, chartGeneration]);

  // Legend only for actionable BUY/SELL history — WAIT never paints on the chart.
  const actionableAnnotations = selectAnnotations(data.annotations);
  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {enabled.tradeSetups && data.predictive && <PlanHud plan={data.predictive} />}
      {enabled.tradeSetups && !data.predictive && actionableAnnotations.length > 0 && (
        <AnnotationLegend annotations={actionableAnnotations.slice(-2).reverse()} />
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
          {plan.target3 != null && (
            <>
              <span className="text-faint">TP3</span>
              <span className="text-info text-right">{plan.target3}</span>
            </>
          )}
          {plan.riskReward != null && (
            <>
              <span className="text-faint">R:R</span>
              <span className="text-brand text-right">1:{plan.riskReward.toFixed(2)}</span>
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
