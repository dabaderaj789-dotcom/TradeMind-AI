import {
  ColorType,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { OverlayKey, ReplayFrame } from "../types";

interface Props {
  frame: ReplayFrame | null;
  enabledOverlays: Set<OverlayKey>;
  onCandleClick?: (barIndex: number) => void;
}

const OVERLAY_COLORS: Record<string, string> = {
  ema: "#f7931a",
  sma: "#627eea",
  vwap: "#e040fb",
};

export function ReplayChart({ frame, enabledOverlays, onCandleClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlayLinesRef = useRef<ISeriesApi<"Line">[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const clickHandlerRef = useRef(onCandleClick);
  const frameRef = useRef(frame);
  clickHandlerRef.current = onCandleClick;
  frameRef.current = frame;
  const [chartReady, setChartReady] = useState(0);
  const showRsi = enabledOverlays.has("rsi");

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0d1117" },
        textColor: "#c9d1d9",
      },
      grid: {
        vertLines: { color: "#21262d" },
        horzLines: { color: "#21262d" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", timeVisible: true },
      autoSize: true,
      height: 420,
    });

    chartRef.current = chart;
    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    volumeSeriesRef.current = chart.addHistogramSeries({
      color: "#388bfd55",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chart.subscribeClick((param) => {
      if (!param.time || !clickHandlerRef.current) return;
      const t = param.time as number;
      const candles = frameRef.current?.candles ?? [];
      const idx = candles.findIndex((c) => c.time === t);
      if (idx >= 0) clickHandlerRef.current(idx);
    });

    setChartReady((n) => n + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Create RSI pane only when overlay is enabled (container must be mounted).
  useEffect(() => {
    if (!showRsi || !rsiRef.current) return;
    const rsiChart = createChart(rsiRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0d1117" },
        textColor: "#c9d1d9",
      },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", visible: false },
      autoSize: true,
      height: 120,
    });
    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiChart.addLineSeries({ color: "#ab47bc", lineWidth: 2 });
    return () => {
      rsiChart.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
    };
  }, [showRsi]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries || !frame) return;

    try {
      for (const line of overlayLinesRef.current) {
        chart.removeSeries(line);
      }
      overlayLinesRef.current = [];

      for (const pl of priceLinesRef.current) {
        try {
          candleSeries.removePriceLine(pl);
        } catch {
          /* series may already be cleared */
        }
      }
      priceLinesRef.current = [];

      const candles = frame.candles
        .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open))
        .map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
      candleSeries.setData(candles);
      candleSeries.setMarkers([]);

      volumeSeries.setData(
        frame.candles
          .filter((c) => Number.isFinite(c.time))
          .map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? "#26a69a55" : "#ef535055",
          })),
      );

      for (const key of ["ema", "sma", "vwap"] as OverlayKey[]) {
        if (!enabledOverlays.has(key)) continue;
        const points = frame.overlays[key] as Array<{ time: number; value: number }> | undefined;
        if (!points?.length) continue;
        const line = chart.addLineSeries({
          color: OVERLAY_COLORS[key],
          lineWidth: 2,
          title: key.toUpperCase(),
        });
        line.setData(
          points
            .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
            .map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
        );
        overlayLinesRef.current.push(line);
      }

      const addPriceLine = (opts: Parameters<ISeriesApi<"Candlestick">["createPriceLine"]>[0]) => {
        const pl = candleSeries.createPriceLine(opts);
        priceLinesRef.current.push(pl);
      };

      if (enabledOverlays.has("market_structure")) {
        const ms = frame.overlays.market_structure as {
          markers?: Array<Record<string, unknown>>;
          support_levels?: Array<{ price: number }>;
          resistance_levels?: Array<{ price: number }>;
        } | undefined;
        if (ms?.markers?.length) {
          candleSeries.setMarkers(
            [...ms.markers]
              .map((m) => ({
                time: m.time as UTCTimestamp,
                position: m.position as "aboveBar" | "belowBar",
                shape: m.shape as "arrowUp" | "arrowDown" | "circle",
                color: m.color as string,
                text: m.text as string,
              }))
              .filter((m) => Number.isFinite(m.time as number))
              .sort((a, b) => (a.time as number) - (b.time as number)),
          );
        }
        for (const lvl of ms?.support_levels ?? []) {
          if (!Number.isFinite(lvl.price)) continue;
          addPriceLine({
            price: lvl.price,
            color: "#26a69a",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: "S",
          });
        }
        for (const lvl of ms?.resistance_levels ?? []) {
          if (!Number.isFinite(lvl.price)) continue;
          addPriceLine({
            price: lvl.price,
            color: "#ef5350",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            title: "R",
          });
        }
      }

      for (const key of ["order_blocks", "fair_value_gaps"] as OverlayKey[]) {
        if (!enabledOverlays.has(key)) continue;
        const zones = frame.overlays[key] as Array<{ high: number; low: number; color?: string }> | undefined;
        if (!zones?.length) continue;
        for (const z of zones) {
          if (!Number.isFinite(z.high) || !Number.isFinite(z.low)) continue;
          const color = z.color ?? "#58a6ff88";
          addPriceLine({ price: z.high, color, lineWidth: 1, title: key });
          addPriceLine({ price: z.low, color, lineWidth: 1, title: key });
        }
      }

      if (enabledOverlays.has("liquidity_sweeps")) {
        const sweeps = frame.overlays.liquidity_sweeps as Array<{ level?: number; price?: number }> | undefined;
        for (const s of sweeps ?? []) {
          const price = s.level ?? s.price;
          if (!Number.isFinite(price)) continue;
          addPriceLine({
            price: price as number,
            color: "#ffeb3b",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "Sweep",
          });
        }
      }

      chart.timeScale().fitContent();

      const rsiSeries = rsiSeriesRef.current;
      const rsiChart = rsiChartRef.current;
      if (showRsi && rsiSeries && rsiChart) {
        const rsi = frame.overlays.rsi as Array<{ time: number; value: number }> | undefined;
        if (rsi?.length) {
          rsiSeries.setData(
            rsi
              .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
              .map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
          );
          rsiChart.timeScale().fitContent();
        } else {
          rsiSeries.setData([]);
        }
      }
    } catch (err) {
      console.error("ReplayChart render failed", err);
    }
  }, [frame, enabledOverlays, chartReady, showRsi]);

  return (
    <div className="chart-stack">
      <div ref={containerRef} className="chart-main" />
      {showRsi && <div ref={rsiRef} className="chart-rsi" />}
    </div>
  );
}
