import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { num } from "../lib/format";
import type { Candle, DynamicLevel, OrderBlock } from "../lib/types";

interface Props {
  candles: Candle[];
  supports?: DynamicLevel[];
  resistances?: DynamicLevel[];
  orderBlocks?: OrderBlock[];
}

const toTime = (iso: string): UTCTimestamp =>
  Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

export default function CandlestickChart({ candles, supports = [], resistances = [], orderBlocks = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);

  // Create chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "Inter, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.06)" },
        horzLines: { color: "rgba(148,163,184,0.06)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Update candle + volume data.
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    const sorted = [...candles].sort(
      (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
    );
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
      color: num(c.close) >= num(c.open) ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
    }));
    candleRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);
    if (candleData.length) chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Update overlay price lines (levels + order block zones).
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];

    const add = (price: number, color: string, title: string, style: LineStyle) => {
      if (!Number.isFinite(price) || price <= 0) return;
      priceLinesRef.current.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: style,
          axisLabelVisible: true,
          title,
        }),
      );
    };

    for (const s of supports.slice(0, 3)) add(num(s.price), "#22c55e", "S", LineStyle.Dashed);
    for (const r of resistances.slice(0, 3)) add(num(r.price), "#ef4444", "R", LineStyle.Dashed);
    for (const ob of orderBlocks.slice(0, 3)) {
      const tone = ob.type?.toLowerCase().includes("bull") ? "#3b6cff" : "#a855f7";
      add(num(ob.zone_high), tone, "OB", LineStyle.Dotted);
      add(num(ob.zone_low), tone, "OB", LineStyle.Dotted);
    }
  }, [supports, resistances, orderBlocks]);

  return <div ref={containerRef} className="h-full w-full" />;
}
