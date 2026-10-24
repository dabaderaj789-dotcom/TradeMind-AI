/**
 * Demo OHLC so the chart still paints when the API returns no bars.
 * Presentation only — never used for trading decisions.
 */

import type { Candle } from "./types";

export function buildSampleCandles(
  symbolId: string,
  timeframe: string,
  count = 120,
  seedPrice = 64000,
): Candle[] {
  const tfMs =
    timeframe === "1m"
      ? 60_000
      : timeframe === "5m"
        ? 300_000
        : timeframe === "15m"
          ? 900_000
          : 900_000;
  const now = Date.now();
  const start = now - count * tfMs;
  let px = seedPrice;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const openTime = start + i * tfMs;
    const drift = Math.sin(i / 9) * (seedPrice * 0.0015) + (Math.random() - 0.48) * (seedPrice * 0.001);
    const open = px;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) * (1 + Math.random() * 0.0008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.0008);
    out.push({
      symbol_id: symbolId,
      symbol_code: "SAMPLE",
      timeframe,
      open_time: new Date(openTime).toISOString(),
      close_time: new Date(openTime + tfMs - 1).toISOString(),
      open,
      high,
      low,
      close,
      volume: 10 + Math.random() * 90,
      is_complete: i < count - 1,
    });
    px = close;
  }
  return out;
}
