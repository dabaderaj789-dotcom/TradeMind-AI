/**
 * Institutional candlestick chart — presentation only.
 * Times labeled in exchange TZ (UTC crypto / IST NSE). No trading-logic changes.
 */

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
  selectCurrentSweeps,
  selectFreshFvgs,
  selectLevelLadder,
  selectPreviousFvgs,
  selectPreviousOrderBlocks,
  selectStructureLadder,
  selectTradePlan,
} from "../../lib/chartQuality";
import {
  chartTzForExchange,
  formatChartTime,
  formatTickMark,
  toChartTime,
  type ChartTz,
} from "../../lib/chartTime";
import type { OverlayId } from "../../lib/overlays";
import { ZonesPrimitive, type PriceZone } from "./zonesPrimitive";
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
  swings?: { time: string; type: string }[];
  /** Exchange code for axis timezone (binance → UTC, nse → IST). */
  exchangeCode?: string | null;
}

interface Props {
  candles: Candle[];
  enabled: Record<OverlayId, boolean>;
  data: OverlayData;
}

function toLineData(bars: AnalysisBar[] | undefined, key: string): LineData[] {
  if (!bars) return [];
  return bars
    .filter((b) => isNum(b.values[key]))
    .map((b) => ({ time: toChartTime(b.open_time), value: num(b.values[key]) }))
    .sort((a, b) => (a.time as number) - (b.time as number));
}

function nearestCandleTime(candles: Candle[], iso: string): UTCTimestamp {
  const target = new Date(iso).getTime();
  if (!candles.length) return toChartTime(iso);
  let best = candles[0];
  let bestDiff = Math.abs(new Date(best.open_time).getTime() - target);
  for (const c of candles) {
    const d = Math.abs(new Date(c.open_time).getTime() - target);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return toChartTime(best.open_time);
}

export function TerminalChart({ candles, enabled, data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lineRefs = useRef<Partial<Record<"ema" | "sma" | "vwap", ISeriesApi<"Line">>>>({});
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const zonesRef = useRef<ZonesPrimitive | null>(null);
  const tzRef = useRef<ChartTz>("UTC");
  const candlesRef = useRef<Candle[]>(candles);
  const [chartGeneration, setChartGeneration] = useState(0);
  candlesRef.current = candles;
  tzRef.current = chartTzForExchange(data.exchangeCode);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(148,163,184,0.88)",
        fontFamily: '"Sora", "IBM Plex Sans", system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148,156,172,0.055)", style: LineStyle.Solid },
        horzLines: { color: "rgba(148,156,172,0.055)", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(148,163,184,0.55)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1a1d24",
          labelVisible: true,
        },
        horzLine: {
          color: "rgba(148,163,184,0.55)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1a1d24",
          labelVisible: true,
        },
      },
      rightPriceScale: {
        borderColor: "rgba(38,43,54,0.85)",
        borderVisible: true,
        scaleMargins: { top: 0.04, bottom: 0.12 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: "rgba(38,43,54,0.85)",
        borderVisible: true,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8,
        minBarSpacing: 2.5,
        fixLeftEdge: false,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar: true,
        tickMarkMaxCharacterLength: 12,
      },
      localization: {
        timeFormatter: (t: Time) => formatChartTime(t, tzRef.current),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      kineticScroll: { touch: true, mouse: false },
      autoSize: true,
    });

    chart.applyOptions({
      timeScale: {
        tickMarkFormatter: (time: Time, tickMarkType: import("lightweight-charts").TickMarkType) =>
          formatTickMark(time, tickMarkType, tzRef.current),
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#34ba7a",
      downColor: "#e85c5c",
      borderUpColor: "#34ba7a",
      borderDownColor: "#e85c5c",
      wickUpColor: "#5fd49a",
      wickDownColor: "#f08080",
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineWidth: 1,
      priceLineColor: "rgba(148,163,184,0.45)",
      priceLineStyle: LineStyle.Dashed,
    });
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });

    const zones = new ZonesPrimitive();
    candleSeries.attachPrimitive(zones);

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    zonesRef.current = zones;
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

  // Keep axis formatters on the latest exchange TZ without recreating the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const tz = chartTzForExchange(data.exchangeCode);
    tzRef.current = tz;
    chart.applyOptions({
      localization: { timeFormatter: (t: Time) => formatChartTime(t, tz) },
      timeScale: {
        tickMarkFormatter: (time: Time, tickMarkType: import("lightweight-charts").TickMarkType) =>
          formatTickMark(time, tickMarkType, tz),
      },
    });
  }, [data.exchangeCode, chartGeneration]);

  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    const sorted = [...candles].sort(
      (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
    );
    const candleData: CandlestickData[] = sorted.map((c) => ({
      time: toChartTime(c.open_time),
      open: num(c.open),
      high: num(c.high),
      low: num(c.low),
      close: num(c.close),
    }));
    const volumeData: HistogramData[] = sorted.map((c) => ({
      time: toChartTime(c.open_time),
      value: num(c.volume),
      color: num(c.close) >= num(c.open) ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)",
    }));
    candleRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);
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

  // Markers: BOS / CHoCH / swings / trade signals
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    const markers: Array<SeriesMarker<Time> & { priority?: number }> = [];
    const bars = candlesRef.current;
    const ladder = selectStructureLadder(data.events);

    const pushStructure = (
      events: typeof ladder.bosCurrent,
      label: string,
      faded: boolean,
    ) => {
      for (const e of events) {
        const up = e.break_price >= e.broken_swing_price;
        markers.push({
          time: nearestCandleTime(bars, e.break_time),
          position: up ? "belowBar" : "aboveBar",
          color: faded
            ? label === "CHoCH"
              ? "rgba(251,191,36,0.35)"
              : up
                ? "rgba(134,239,172,0.32)"
                : "rgba(252,165,165,0.32)"
            : label === "CHoCH"
              ? "rgba(251,191,36,0.7)"
              : up
                ? "rgba(134,239,172,0.65)"
                : "rgba(252,165,165,0.65)",
          shape: label === "CHoCH" ? "circle" : up ? "arrowUp" : "arrowDown",
          size: 0,
          text: faded ? `Prev ${label}` : label,
          priority: markerPriority(label) - (faded ? 8 : 0),
        });
      }
    };

    if (enabled.bos) {
      pushStructure(ladder.bosCurrent, "BOS", false);
      pushStructure(ladder.bosPrevious, "BOS", true);
    }
    if (enabled.choch) {
      pushStructure(ladder.chochCurrent, "CHoCH", false);
      pushStructure(ladder.chochPrevious, "CHoCH", true);
    }

    const swingOn = (type: string) => {
      if (type === "HH") return enabled.hh;
      if (type === "HL") return enabled.hl;
      if (type === "LH") return enabled.lh;
      if (type === "LL") return enabled.ll;
      return false;
    };

    if (data.swings?.length) {
      const recent = data.swings.slice(-8);
      for (const s of recent) {
        if (!swingOn(s.type)) continue;
        const high = s.type === "HH" || s.type === "LH";
        markers.push({
          time: nearestCandleTime(bars, s.time),
          position: high ? "aboveBar" : "belowBar",
          color: s.type.startsWith("H") ? "rgba(134,239,172,0.45)" : "rgba(252,165,165,0.45)",
          shape: "square",
          size: 0,
          text: s.type,
          priority: 25,
        });
      }
    }

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
    series.setMarkers(declutterMarkers(markers, 3) as SeriesMarker<Time>[]);
  }, [enabled, data, candles, chartGeneration]);

  // Price lines: S/R ladder + sweeps + refs + trade plan
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

    const lastPx =
      data.quote?.current_price ??
      (candlesRef.current.length ? num(candlesRef.current[candlesRef.current.length - 1].close) : null);
    const levels = selectLevelLadder(data.levels, lastPx);

    if (enabled.support && levels.support != null) {
      add(levels.support, "rgba(52,186,122,0.75)", "Support", LineStyle.Dashed, 1);
    }
    if (enabled.resistance && levels.resistance != null) {
      add(levels.resistance, "rgba(232,92,92,0.75)", "Resistance", LineStyle.Dashed, 1);
    }
    if (enabled.prevSupport && levels.prevSupport != null) {
      add(levels.prevSupport, "rgba(52,186,122,0.35)", "Prev Support", LineStyle.SparseDotted, 1);
    }
    if (enabled.prevResistance && levels.prevResistance != null) {
      add(levels.prevResistance, "rgba(232,92,92,0.35)", "Prev Resistance", LineStyle.SparseDotted, 1);
    }

    if (enabled.sweeps) {
      for (const s of selectCurrentSweeps(data.sweeps, true)) {
        const bull = s.type.toLowerCase().includes("bull");
        add(
          num(s.sweep_level),
          bull ? "rgba(250,204,21,0.45)" : "rgba(244,114,182,0.45)",
          "Sweep",
          LineStyle.SparseDotted,
          1,
        );
      }
    }

    if (enabled.priceReferences && data.quote) {
      const q = data.quote;
      add(q.current_price, "rgba(79,124,255,0.85)", "Last", LineStyle.Solid, 1);
      add(q.day_high, "rgba(34,197,94,0.35)", "Day High", LineStyle.Dotted, 1);
      add(q.day_low, "rgba(239,68,68,0.35)", "Day Low", LineStyle.Dotted, 1);
      add(q.prev_close, "rgba(148,163,184,0.45)", "Prev Close", LineStyle.LargeDashed, 1);
      add(q.vwap, "rgba(168,85,247,0.55)", "VWAP", LineStyle.Solid, 1);
    }

    if (enabled.tradeSetups) {
      const { predictive: plan } = selectTradePlan(data.predictive, data.setups);
      if (plan) {
        add(plan.entry, "#4f7cff", "Entry", LineStyle.Solid, 2);
        add(plan.stop, "rgba(239,68,68,0.9)", "Stop", LineStyle.Solid, 1);
        add(plan.target1, "rgba(56,189,248,0.9)", "TP1", LineStyle.Solid, 1);
        if (plan.target2 != null) add(plan.target2, "rgba(56,189,248,0.55)", "TP2", LineStyle.Dashed, 1);
        if (plan.target3 != null) add(plan.target3, "rgba(56,189,248,0.35)", "TP3", LineStyle.Dotted, 1);
      }
    }
  }, [enabled, data, chartGeneration]);

  // Shaded zones: current + previous OB / FVG (previous faded)
  useEffect(() => {
    const zonesApi = zonesRef.current;
    if (!zonesApi) return;
    const bars = candlesRef.current;
    const zones: PriceZone[] = [];

    if (enabled.orderBlocks) {
      for (const ob of selectActiveOrderBlocks(data.orderBlocks, false)) {
        const bull = ob.type.toLowerCase().includes("bull");
        zones.push({
          id: `ob-${ob.order_block_id}`,
          priceHigh: num(ob.zone_high),
          priceLow: num(ob.zone_low),
          timeStart: bars.length ? nearestCandleTime(bars, ob.created_at) : null,
          fillColor: bull ? "rgba(34,197,94,0.1)" : "rgba(168,85,247,0.1)",
          borderColor: bull ? "rgba(34,197,94,0.32)" : "rgba(168,85,247,0.32)",
          label: bull ? "OB · Demand" : "OB · Supply",
          labelColor: bull ? "rgba(134,239,172,0.8)" : "rgba(216,180,254,0.8)",
        });
      }
    }

    if (enabled.prevOrderBlocks) {
      for (const ob of selectPreviousOrderBlocks(data.orderBlocks)) {
        const bull = ob.type.toLowerCase().includes("bull");
        zones.push({
          id: `ob-prev-${ob.order_block_id}`,
          priceHigh: num(ob.zone_high),
          priceLow: num(ob.zone_low),
          timeStart: bars.length ? nearestCandleTime(bars, ob.created_at) : null,
          fillColor: bull ? "rgba(34,197,94,0.04)" : "rgba(168,85,247,0.04)",
          borderColor: bull ? "rgba(34,197,94,0.14)" : "rgba(168,85,247,0.14)",
          label: bull ? "Prev OB" : "Prev OB",
          labelColor: "rgba(148,163,184,0.55)",
        });
      }
    }

    if (enabled.fvg) {
      for (const g of selectFreshFvgs(data.fvgs, false)) {
        const bull = g.type.toLowerCase().includes("bull");
        zones.push({
          id: `fvg-${g.fvg_id}`,
          priceHigh: num(g.gap_high),
          priceLow: num(g.gap_low),
          timeStart: bars.length ? nearestCandleTime(bars, g.created_at) : null,
          fillColor: bull ? "rgba(34,211,238,0.08)" : "rgba(56,189,248,0.08)",
          borderColor: bull ? "rgba(34,211,238,0.26)" : "rgba(56,189,248,0.26)",
          label: "FVG",
          labelColor: "rgba(165,243,252,0.75)",
        });
      }
    }

    if (enabled.prevFvg) {
      for (const g of selectPreviousFvgs(data.fvgs)) {
        const bull = g.type.toLowerCase().includes("bull");
        zones.push({
          id: `fvg-prev-${g.fvg_id}`,
          priceHigh: num(g.gap_high),
          priceLow: num(g.gap_low),
          timeStart: bars.length ? nearestCandleTime(bars, g.created_at) : null,
          fillColor: bull ? "rgba(34,211,238,0.03)" : "rgba(56,189,248,0.03)",
          borderColor: bull ? "rgba(34,211,238,0.12)" : "rgba(56,189,248,0.12)",
          label: "Prev FVG",
          labelColor: "rgba(148,163,184,0.5)",
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
  }, [enabled, data, candles, chartGeneration]);

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
    <div className="pointer-events-none absolute left-2 top-2 max-w-[220px] animate-fade-in">
      <div
        className={`rounded-lg border px-3 py-2.5 shadow-pop backdrop-blur-xl ${
          buy ? "border-bull/25 bg-surface/90" : "border-bear/25 bg-surface/90"
        }`}
      >
        <div className={`font-display text-[11px] font-semibold tracking-wide ${buy ? "text-bull" : "text-bear"}`}>
          {plan.label}
          <span className="ml-2 font-mono text-muted">{Math.round(plan.confidence)}%</span>
        </div>
        <div className="mt-0.5 text-[10px] text-faint">
          {plan.state} · {plan.setupType}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
          <span className="text-faint">Entry</span>
          <span className="text-right text-brand">{plan.entry}</span>
          <span className="text-faint">Stop</span>
          <span className="text-right text-bear">{plan.stop}</span>
          <span className="text-faint">TP1</span>
          <span className="text-right text-info">{plan.target1}</span>
          {plan.riskReward != null && (
            <>
              <span className="text-faint">R:R</span>
              <span className="text-right text-content">1:{plan.riskReward.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AnnotationLegend({ annotations }: { annotations: ChartAnnotation[] }) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[280px] flex-col gap-1">
      {annotations.map((a) => {
        const color =
          a.side === "buy"
            ? "text-bull border-bull/30 bg-bull/10"
            : a.side === "sell"
              ? "text-bear border-bear/30 bg-bear/10"
              : "text-warn border-warn/30 bg-warn/10";
        return (
          <div
            key={`${a.time}-${a.side}-${a.setupType}`}
            className={`rounded-md border px-2 py-1 text-[10px] backdrop-blur-md ${color}`}
          >
            <div className="font-semibold tracking-wide">
              {a.label} · {Math.round(a.confidence)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
