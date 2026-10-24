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
import { isNum, num, fmtPrice } from "../../lib/format";
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
import { DrawingOverlay } from "./DrawingOverlay";
import { useSettings } from "../../store/settings";
import { subscribeChartTip } from "../../lib/chartTipBus";
import { useLatencyLab } from "../../store/latencyLab";
import type { CardwellRsiState } from "../../lib/cardwellRsi";
import type { ChartTypeId } from "../../store/workspace";
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
  cardwellRsi?: CardwellRsiState | null;
  /** Exchange code for axis timezone (binance → UTC, nse → IST). */
  exchangeCode?: string | null;
}

interface Props {
  candles: Candle[];
  enabled: Record<OverlayId, boolean>;
  data: OverlayData;
  symbolId?: string;
  /** Display code for last-price label (e.g. BTCUSDT). */
  symbolCode?: string;
  timeframe?: string;
  /** TradingView-style mm:ss until current bar closes */
  countdown?: string | null;
  chartType?: ChartTypeId;
}

function toHeikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const o = num(c.open);
    const h = num(c.high);
    const l = num(c.low);
    const cl = num(c.close);
    const haClose = (o + h + l + cl) / 4;
    const haOpen = i === 0 ? (o + cl) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(h, haOpen, haClose);
    const haLow = Math.min(l, haOpen, haClose);
    out.push({
      ...c,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
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

export function TerminalChart({
  candles,
  enabled,
  data,
  symbolId = "",
  symbolCode = "",
  timeframe = "15m",
  countdown = null,
  chartType = "candles",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPriceLabelRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<
    ISeriesApi<"Candlestick"> | ISeriesApi<"Bar"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null
  >(null);
  const chartTypeRef = useRef<ChartTypeId>(chartType);
  chartTypeRef.current = chartType;
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lineRefs = useRef<Partial<Record<"ema" | "sma" | "vwap", ISeriesApi<"Line">>>>({});
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const zonesRef = useRef<ZonesPrimitive | null>(null);
  const tzRef = useRef<ChartTz>("UTC");
  const candlesRef = useRef<Candle[]>(candles);
  const [chartGeneration, setChartGeneration] = useState(0);
  const theme = useSettings((s) => s.theme);
  const isLight = theme === "light";
  candlesRef.current = candles;
  tzRef.current = chartTzForExchange(data.exchangeCode);

  // Keep page from scrolling when wheel is used over the chart host.
  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  const lastCandle = candles.length ? candles[candles.length - 1] : null;
  const lastClose = lastCandle ? num(lastCandle.close) : null;
  const lastBullish = lastCandle ? num(lastCandle.close) >= num(lastCandle.open) : true;
  const labelCode =
    (symbolCode || data.quote?.symbol_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "";

  useEffect(() => {
    const host = rootRef.current;
    const container = containerRef.current;
    if (!host || !container) return;

    let chart: IChartApi | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let raf = 0;

    const syncSize = () => {
      if (cancelled || !rootRef.current || !containerRef.current) return;
      const { clientWidth: w, clientHeight: h } = rootRef.current;
      if (w < 16 || h < 16) return;

      if (chart) {
        try {
          chart.resize(w, h, true);
        } catch {
          /* disposed */
        }
        return;
      }

      const axisText = isLight ? "rgba(55, 65, 81, 0.95)" : "rgba(226, 232, 240, 0.95)";
      const grid = isLight ? "rgba(15, 23, 42, 0.055)" : "rgba(148, 163, 184, 0.12)";
      const border = isLight ? "rgba(203, 213, 225, 0.95)" : "rgba(71, 85, 105, 0.9)";
      const cross = isLight ? "rgba(100, 116, 139, 0.75)" : "rgba(203, 213, 225, 0.75)";
      const labelBg = isLight ? "#1e293b" : "#0f1218";

      try {
        chart = createChart(containerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: isLight ? "#ffffff" : "transparent" },
            textColor: axisText,
            fontFamily: '"DM Sans", "IBM Plex Sans", system-ui, sans-serif',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: grid, style: LineStyle.Solid },
            horzLines: { color: grid, style: LineStyle.Solid },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: {
              color: cross,
              width: 1,
              style: LineStyle.Dashed,
              labelBackgroundColor: labelBg,
              labelVisible: true,
            },
            horzLine: {
              color: cross,
              width: 1,
              style: LineStyle.Dashed,
              labelBackgroundColor: labelBg,
              labelVisible: true,
            },
          },
          rightPriceScale: {
            borderColor: border,
            borderVisible: true,
            scaleMargins: { top: 0.04, bottom: 0.12 },
          },
          timeScale: {
            borderColor: border,
            borderVisible: true,
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 8,
            barSpacing: 8,
            minBarSpacing: 2,
            fixLeftEdge: false,
            fixRightEdge: false,
            shiftVisibleRangeOnNewBar: true,
            tickMarkMaxCharacterLength: 10,
          },
          localization: {
            timeFormatter: (t: Time) => formatChartTime(t, tzRef.current),
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
          handleScale: {
            axisPressedMouseMove: { time: true, price: true },
            axisDoubleClickReset: { time: true, price: true },
            mouseWheel: true,
            pinch: true,
          },
          kineticScroll: { touch: true, mouse: false },
          autoSize: false,
          width: w,
          height: h,
        });

        chart.applyOptions({
          timeScale: {
            tickMarkFormatter: (time: Time, tickMarkType: import("lightweight-charts").TickMarkType) =>
              formatTickMark(time, tickMarkType, tzRef.current),
          },
        });

        const candleSeries =
          chartType === "line"
            ? chart.addLineSeries({
                color: "#38bdf8",
                lineWidth: 2,
                priceLineVisible: true,
                lastValueVisible: true,
              })
            : chartType === "area"
              ? chart.addAreaSeries({
                  lineColor: "#38bdf8",
                  topColor: "rgba(56, 189, 248, 0.35)",
                  bottomColor: "rgba(56, 189, 248, 0.02)",
                  lineWidth: 2,
                  priceLineVisible: true,
                  lastValueVisible: true,
                })
            : chartType === "bars"
              ? chart.addBarSeries({
                  upColor: "#0ea86a",
                  downColor: "#e11d48",
                  thinBars: false,
                  priceLineVisible: true,
                  lastValueVisible: true,
                })
              : chart.addCandlestickSeries({
                  upColor: isLight ? "#00a65a" : "#0ea86a",
                  downColor: isLight ? "#dc2626" : "#e11d48",
                  borderVisible: false,
                  wickUpColor: isLight ? "#00a65a" : "#047857",
                  wickDownColor: isLight ? "#dc2626" : "#be123c",
                  priceLineVisible: true,
                  lastValueVisible: true,
                  priceLineWidth: 1,
                  priceLineColor: isLight ? "rgba(15, 23, 42, 0.55)" : "rgba(248, 250, 252, 0.7)",
                  priceLineStyle: LineStyle.Solid,
                });
        const volumeSeries = chart.addHistogramSeries({
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
          lastValueVisible: false,
          priceLineVisible: false,
        });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });

        const zones = new ZonesPrimitive();
        // Zones attach only to candlestick/bar series that support primitives well
        try {
          (candleSeries as ISeriesApi<"Candlestick">).attachPrimitive(zones);
        } catch {
          /* line series may not support all primitives */
        }

        chartRef.current = chart;
        candleRef.current = candleSeries;
        volumeRef.current = volumeSeries;
        zonesRef.current = zones;
        setChartGeneration((generation) => generation + 1);
      } catch (err) {
        console.error("[TerminalChart] createChart failed", err);
        chart = null;
      }
    };

    const scheduleSync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncSize);
    };

    syncSize();
    scheduleSync();
    ro = new ResizeObserver(scheduleSync);
    ro.observe(host);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      try {
        chart?.remove();
      } catch {
        /* disposed */
      }
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      zonesRef.current = null;
      lineRefs.current = {};
      priceLinesRef.current = [];
    };
  }, [isLight, chartType]);

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
    const fit = () => {
      try {
        chartRef.current?.timeScale().fitContent();
      } catch {
        /* disposed */
      }
    };
    const visibleBars = (e: Event) => {
      const bars = (e as CustomEvent<{ bars: number }>).detail?.bars;
      const chart = chartRef.current;
      if (!chart || !bars) return;
      try {
        const len = (candleRef.current as unknown as { __tmLen?: number }).__tmLen ?? bars;
        const to = len - 1;
        const from = Math.max(0, to - bars);
        chart.timeScale().setVisibleLogicalRange({ from, to });
      } catch {
        /* disposed */
      }
    };
    window.addEventListener("trademind:fit-chart", fit);
    window.addEventListener("trademind:visible-bars", visibleBars);
    return () => {
      window.removeEventListener("trademind:fit-chart", fit);
      window.removeEventListener("trademind:visible-bars", visibleBars);
    };
  }, [chartGeneration]);

  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    const sortedRaw = [...candles].sort(
      (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
    );
    const sorted = chartType === "heikin" ? toHeikinAshi(sortedRaw) : sortedRaw;
    const type = chartTypeRef.current;

    const ohlcData: CandlestickData[] = sorted.map((c) => ({
      time: toChartTime(c.open_time),
      open: num(c.open),
      high: num(c.high),
      low: num(c.low),
      close: num(c.close),
    }));
    const lineData: LineData[] = sorted.map((c) => ({
      time: toChartTime(c.open_time),
      value: num(c.close),
    }));
    const volumeData: HistogramData[] = sorted.map((c) => ({
      time: toChartTime(c.open_time),
      value: num(c.volume),
      color: num(c.close) >= num(c.open) ? "rgba(14,168,106,0.28)" : "rgba(225,29,72,0.28)",
    }));

    const meta = candleRef.current as unknown as { __tmLen?: number; __tmTipTime?: number };
    const prevLen = meta.__tmLen ?? 0;
    const prevTipTime = meta.__tmTipTime;
    const tipOhlc = ohlcData[ohlcData.length - 1];
    const tipLine = lineData[lineData.length - 1];
    const tipTime =
      tipOhlc && typeof tipOhlc.time === "number"
        ? tipOhlc.time
        : tipLine && typeof tipLine.time === "number"
          ? tipLine.time
          : null;

    const applyFull = () => {
      if (type === "line" || type === "area") {
        (candleRef.current as ISeriesApi<"Line">).setData(lineData);
      } else {
        (candleRef.current as ISeriesApi<"Candlestick">).setData(ohlcData);
      }
      volumeRef.current!.setData(volumeData);
    };

    if (prevLen === ohlcData.length && tipOhlc && prevLen > 0 && tipTime === prevTipTime) {
      try {
        if ((type === "line" || type === "area") && tipLine) {
          (candleRef.current as ISeriesApi<"Line">).update(tipLine);
        } else {
          (candleRef.current as ISeriesApi<"Candlestick">).update(tipOhlc);
        }
        if (volumeData[volumeData.length - 1]) volumeRef.current.update(volumeData[volumeData.length - 1]);
      } catch {
        applyFull();
      }
    } else {
      applyFull();
    }

    const chart = chartRef.current;
    if (chart && ohlcData.length && (prevLen === 0 || prevLen < 8)) {
      const bars = Math.min(48, ohlcData.length);
      const from = Math.max(0, ohlcData.length - bars);
      try {
        chart.timeScale().setVisibleLogicalRange({
          from: from - 0.5,
          to: ohlcData.length + 5,
        });
      } catch {
        chart.timeScale().fitContent();
      }
    }
    meta.__tmLen = ohlcData.length;
    meta.__tmTipTime = tipTime ?? undefined;
  }, [candles, chartGeneration, timeframe, chartType]);

  // V7: imperative tip paint from the tick bus — no React candle array rebuild.
  useEffect(() => {
    if (!symbolId) return;
    const markRendered = useLatencyLab.getState().markRendered;
    return subscribeChartTip((tick) => {
      if (tick.symbolId !== symbolId) return;
      const series = candleRef.current;
      const bars = candlesRef.current;
      if (!series || !bars.length) return;
      const tipBar = bars[bars.length - 1];
      const tip = {
        time: toChartTime(tipBar.open_time),
        open: num(tipBar.open),
        high: Math.max(num(tipBar.high), tick.price, num(tipBar.open)),
        low: Math.min(num(tipBar.low), tick.price, num(tipBar.open)),
        close: tick.price,
      };
      try {
        if (chartTypeRef.current === "line" || chartTypeRef.current === "area") {
          (series as ISeriesApi<"Line">).update({ time: tip.time, value: tip.close });
        } else {
          (series as ISeriesApi<"Candlestick">).update(tip);
        }
        // Keep local tip high/low so the next React setData does not shrink the wick.
        tipBar.high = tip.high;
        tipBar.low = tip.low;
        tipBar.close = tip.close;
        if (tick.volume != null) tipBar.volume = num(tipBar.volume) + tick.volume;
        markRendered(Date.now());
        try {
          if (volumeRef.current && tipBar.volume != null) {
            volumeRef.current.update({
              time: tip.time,
              value: num(tipBar.volume),
              color:
                tip.close >= tip.open ? "rgba(14,168,106,0.28)" : "rgba(225,29,72,0.28)",
            });
          }
        } catch {
          /* volume tip optional */
        }
        // Sync last-price label without waiting for React.
        const el = lastPriceLabelRef.current;
        const chart = chartRef.current;
        if (el && chart) {
          const y = series.priceToCoordinate(tick.price);
          if (y != null) {
            el.style.transform = `translateY(${y - el.offsetHeight / 2}px)`;
            const priceEl = el.querySelector("[data-tm-last-price]");
            if (priceEl) priceEl.textContent = fmtPrice(tick.price);
          }
        }
      } catch {
        /* disposed */
      }
    });
  }, [symbolId, chartGeneration]);

  // TradingView-style: when countdown is live, hide native last-value (we paint our own).
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    try {
      series.applyOptions({ lastValueVisible: !countdown });
    } catch {
      /* disposed */
    }
  }, [countdown, chartGeneration]);

  // Keep countdown label glued to the last price on the right axis.
  useEffect(() => {
    const el = lastPriceLabelRef.current;
    const series = candleRef.current;
    const chart = chartRef.current;
    if (!el || !series || !chart || !countdown || lastClose == null) {
      if (el) el.style.visibility = "hidden";
      return;
    }

    const sync = () => {
      try {
        const y = series.priceToCoordinate(lastClose);
        if (y == null || !Number.isFinite(y)) {
          el.style.visibility = "hidden";
          return;
        }
        el.style.visibility = "visible";
        el.style.top = `${y}px`;
      } catch {
        el.style.visibility = "hidden";
      }
    };

    sync();
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(sync);
    const id = window.setInterval(sync, 250);
    window.addEventListener("resize", sync);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(sync);
      clearInterval(id);
      window.removeEventListener("resize", sync);
    };
  }, [countdown, lastClose, chartGeneration, candles.length]);

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
              ? "#b45309"
              : up
                ? "#15803d"
                : "#b91c1c"
            : label === "CHoCH"
              ? "#d97706"
              : up
                ? "#16a34a"
                : "#dc2626",
          shape: label === "CHoCH" ? "circle" : up ? "arrowUp" : "arrowDown",
          size: faded ? 1 : 2,
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
          color: s.type.startsWith("H") ? "#15803d" : "#b91c1c",
          shape: "square",
          size: 1,
          text: s.type,
          priority: 25,
        });
      }
    }

    if (enabled.tradeSetups) {
      for (const a of selectAnnotations(data.annotations)) {
        const time = nearestCandleTime(bars, a.time);
        if (a.side === "buy") {
          markers.push({
            time,
            position: "belowBar",
            color: "#34ba7a",
            shape: "circle",
            size: 2,
            text: "B",
            priority: 90,
          });
        } else if (a.side === "sell") {
          markers.push({
            time,
            position: "aboveBar",
            color: "#e85c5c",
            shape: "circle",
            size: 2,
            text: "S",
            priority: 90,
          });
        }
      }
    }

    if (enabled.cardwellRsi && data.cardwellRsi) {
      for (const r of data.cardwellRsi.reversals.slice(-8)) {
        markers.push({
          time: nearestCandleTime(bars, r.time),
          position: r.type === "PR" ? "belowBar" : "aboveBar",
          color: r.type === "PR" ? "#34d399" : "#f87171",
          shape: r.type === "PR" ? "arrowUp" : "arrowDown",
          size: 1,
          text: r.type === "PR" ? "+R" : "−R",
          priority: 40,
        });
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
      add(levels.support, "#059669", "Support", LineStyle.Solid, 2);
    }
    if (enabled.resistance && levels.resistance != null) {
      add(levels.resistance, "#e11d48", "Resistance", LineStyle.Solid, 2);
    }
    if (enabled.prevSupport && levels.prevSupport != null) {
      add(levels.prevSupport, "rgba(5,150,105,0.7)", "Prev Support", LineStyle.Dashed, 2);
    }
    if (enabled.prevResistance && levels.prevResistance != null) {
      add(levels.prevResistance, "rgba(225,29,72,0.7)", "Prev Resistance", LineStyle.Dashed, 2);
    }

    if (enabled.sweeps) {
      for (const s of selectCurrentSweeps(data.sweeps, true)) {
        const bull = s.type.toLowerCase().includes("bull");
        add(
          num(s.sweep_level),
          bull ? "#ca8a04" : "#db2777",
          "Sweep",
          LineStyle.Dashed,
          2,
        );
      }
    }

    if (enabled.priceReferences && data.quote) {
      const q = data.quote;
      add(q.current_price, "#2563eb", "Last", LineStyle.Solid, 2);
      add(q.day_high, "#16a34a", "Day High", LineStyle.Dashed, 2);
      add(q.day_low, "#dc2626", "Day Low", LineStyle.Dashed, 2);
      add(q.prev_close, "#64748b", "Prev Close", LineStyle.LargeDashed, 2);
      add(q.vwap, "#7c3aed", "VWAP", LineStyle.Solid, 2);
    }

    if (enabled.cardwellRsi && data.cardwellRsi) {
      const cr = data.cardwellRsi;
      const want = new Set<number>([40, 60]);
      if (cr.regime === "BULL") want.add(80);
      if (cr.regime === "BEAR") want.add(20);
      for (const lvl of cr.levels) {
        if (!want.has(lvl.rsi)) continue;
        const key = lvl.rsi;
        const bullKey = key === 40 || key === 80;
        add(
          lvl.price,
          bullKey ? "rgba(52,211,153,0.85)" : "rgba(248,113,113,0.85)",
          lvl.label,
          key === 40 || key === 60 ? LineStyle.Dashed : LineStyle.Dotted,
          1,
        );
      }
      const lastRev = cr.reversals[cr.reversals.length - 1];
      if (lastRev?.target != null) {
        add(
          lastRev.target,
          lastRev.type === "PR" ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)",
          lastRev.type === "PR" ? "+R tgt" : "−R tgt",
          LineStyle.Dotted,
          1,
        );
      }
    }

    if (enabled.tradeSetups) {
      const { predictive: plan } = selectTradePlan(data.predictive, data.setups);
      if (plan) {
        add(plan.entry, "#2563eb", "Entry", LineStyle.Solid, 3);
        add(plan.stop, "#e11d48", "Stop", LineStyle.Solid, 2);
        add(plan.target1, "#0284c7", "TP1", LineStyle.Solid, 2);
        if (plan.target2 != null) add(plan.target2, "rgba(2,132,199,0.85)", "TP2", LineStyle.Dashed, 2);
        if (plan.target3 != null) add(plan.target3, "rgba(2,132,199,0.6)", "TP3", LineStyle.Dotted, 2);
      }
    }
  }, [enabled, data, chartGeneration]);

  // Shaded zones: current + previous OB / FVG (previous faded)
  useEffect(() => {
    const zonesApi = zonesRef.current;
    if (!zonesApi) return;
    const bars = candlesRef.current;
    const zones: PriceZone[] = [];

    const light = useSettings.getState().theme === "light";

    if (enabled.orderBlocks) {
      for (const ob of selectActiveOrderBlocks(data.orderBlocks, false)) {
        const bull = ob.type.toLowerCase().includes("bull");
        zones.push({
          id: `ob-${ob.order_block_id}`,
          priceHigh: num(ob.zone_high),
          priceLow: num(ob.zone_low),
          timeStart: bars.length ? nearestCandleTime(bars, ob.created_at) : null,
          fillColor: bull ? "rgba(5,150,105,0.16)" : "rgba(124,58,237,0.14)",
          borderColor: bull ? "rgba(5,150,105,0.75)" : "rgba(124,58,237,0.75)",
          label: bull ? "OB · Demand" : "OB · Supply",
          labelColor: light
            ? bull
              ? "#047857"
              : "#6d28d9"
            : bull
              ? "#86efac"
              : "#d8b4fe",
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
          fillColor: bull ? "rgba(5,150,105,0.07)" : "rgba(124,58,237,0.07)",
          borderColor: bull ? "rgba(5,150,105,0.4)" : "rgba(124,58,237,0.4)",
          label: "Prev OB",
          labelColor: light ? "#475569" : "rgba(203,213,225,0.85)",
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
          fillColor: bull ? "rgba(8,145,178,0.14)" : "rgba(2,132,199,0.14)",
          borderColor: bull ? "rgba(8,145,178,0.7)" : "rgba(2,132,199,0.7)",
          label: "FVG",
          labelColor: light ? "#0e7490" : "#a5f3fc",
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
          fillColor: bull ? "rgba(8,145,178,0.05)" : "rgba(2,132,199,0.05)",
          borderColor: bull ? "rgba(8,145,178,0.35)" : "rgba(2,132,199,0.35)",
          label: "Prev FVG",
          labelColor: light ? "#475569" : "rgba(203,213,225,0.8)",
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
          fillColor: buy ? "rgba(5,150,105,0.12)" : "rgba(225,29,72,0.12)",
          borderColor: buy ? "rgba(5,150,105,0.65)" : "rgba(225,29,72,0.65)",
          label: buy ? "Buy Zone" : "Sell Zone",
          labelColor: light ? (buy ? "#047857" : "#be123c") : buy ? "#86efac" : "#fca5a5",
        });
      }
    }

    zonesApi.setZones(zones);
  }, [enabled, data, candles, chartGeneration]);

  const actionableAnnotations = selectAnnotations(data.annotations);
  return (
    <div ref={rootRef} className="relative h-full w-full min-h-0 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      {chartGeneration > 0 && (
        <DrawingOverlay
          symbolId={symbolId}
          chart={chartRef.current}
          series={candleRef.current as ISeriesApi<"Candlestick"> | null}
          candles={candles}
        />
      )}
      {countdown && lastClose != null && (
        <div
          ref={lastPriceLabelRef}
          className="pointer-events-none absolute right-0 z-30 -translate-y-1/2 pr-[2px]"
          style={{ visibility: "hidden" }}
          title={`${timeframe} candle closes in ${countdown}`}
        >
          <div
            className={`min-w-[72px] rounded-sm px-1.5 py-0.5 text-right shadow-card ${
              lastBullish ? "bg-bull text-white" : "bg-bear text-white"
            }`}
          >
            <div className="whitespace-nowrap text-[10px] font-bold leading-tight tabular-nums tracking-tight">
              {labelCode ? `${labelCode} ` : ""}
              <span data-tm-last-price>{fmtPrice(lastClose)}</span>
            </div>
            <div className="text-center font-mono text-[11px] font-bold leading-tight tabular-nums tracking-wider">
              {countdown}
            </div>
          </div>
        </div>
      )}
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
