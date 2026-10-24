/**
 * Andrew Cardwell RSI — TradingView-style oscillator + inverse price levels.
 *
 * - Wilder RSI(14)
 * - Bull regime: RSI holds ~40–80 (40 is support)
 * - Bear regime: RSI holds ~20–60 (60 is resistance)
 * - Positive reversal: price higher low + RSI lower low (continuation)
 * - Negative reversal: price lower high + RSI higher high (continuation)
 * - Inverse RSI rungs: exact next-bar prices for RSI 20/40/50/60/80
 */

import type { Candle } from "./types";
import { num } from "./format";

export const CARDWELL_PERIOD = 14;
export const CARDWELL_PIVOT = 5;
export const CARDWELL_REGIME_BARS = 20;

export type CardwellRegime = "BULL" | "BEAR" | "NEUTRAL";

export interface CardwellRsiBar {
  openTime: string;
  close: number;
  low: number;
  high: number;
  rsi: number | null;
  avgGain: number | null;
  avgLoss: number | null;
  fastMa: number | null;
  slowMa: number | null;
}

export interface CardwellReversal {
  type: "PR" | "NR";
  time: string;
  price: number;
  rsi: number;
  target: number | null;
}

export interface InverseRsiLevel {
  rsi: number;
  price: number;
  label: string;
}

export interface CardwellRsiState {
  bars: CardwellRsiBar[];
  regime: CardwellRegime;
  lastRsi: number | null;
  lastFastMa: number | null;
  lastSlowMa: number | null;
  levels: InverseRsiLevel[];
  reversals: CardwellReversal[];
}

function wma(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = values.map(() => null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let ok = true;
    for (let k = 0; k < period; k++) {
      const v = values[i - period + 1 + k];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v * (k + 1);
    }
    if (ok) out[i] = sum / denom;
  }
  return out;
}

function wilderRsi(closes: number[], period: number): {
  rsi: Array<number | null>;
  avgGain: Array<number | null>;
  avgLoss: Array<number | null>;
} {
  const n = closes.length;
  const rsi: Array<number | null> = Array(n).fill(null);
  const avgGain: Array<number | null> = Array(n).fill(null);
  const avgLoss: Array<number | null> = Array(n).fill(null);
  if (n < period + 1) return { rsi, avgGain, avgLoss };

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    gainSum += Math.max(ch, 0);
    lossSum += Math.max(-ch, 0);
  }
  let ag = gainSum / period;
  let al = lossSum / period;
  avgGain[period] = ag;
  avgLoss[period] = al;
  rsi[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);

  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(ch, 0)) / period;
    al = (al * (period - 1) + Math.max(-ch, 0)) / period;
    avgGain[i] = ag;
    avgLoss[i] = al;
    rsi[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return { rsi, avgGain, avgLoss };
}

function inverseRsiPrice(close: number, avgGain: number, avgLoss: number, targetRsi: number, period: number): number | null {
  if (targetRsi <= 0 || targetRsi >= 100) return null;
  const rs = targetRsi / (100 - targetRsi);
  const up = (period - 1) * (rs * avgLoss - avgGain);
  const down = (period - 1) * (avgLoss - avgGain / rs);
  const x = up >= 0 ? up : down;
  const px = close + x;
  return Number.isFinite(px) && px > 0 ? px : null;
}

function classifyRegime(rsi: Array<number | null>, lookback: number): CardwellRegime {
  const vals = rsi.filter((v): v is number => v != null).slice(-lookback);
  if (vals.length < 8) return "NEUTRAL";
  const below40 = vals.filter((v) => v < 40).length;
  const above60 = vals.filter((v) => v > 60).length;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  // Cardwell: bull holds 40–80; bear holds 20–60.
  if (below40 <= 2 && avg >= 50) return "BULL";
  if (above60 <= 2 && avg <= 50) return "BEAR";
  return "NEUTRAL";
}

function pivotLow(values: number[], i: number, left: number, right: number): boolean {
  const v = values[i];
  for (let k = 1; k <= left; k++) if (values[i - k] < v) return false;
  for (let k = 1; k <= right; k++) if (values[i + k] <= v) return false;
  return true;
}

function pivotHigh(values: number[], i: number, left: number, right: number): boolean {
  const v = values[i];
  for (let k = 1; k <= left; k++) if (values[i - k] > v) return false;
  for (let k = 1; k <= right; k++) if (values[i + k] >= v) return false;
  return true;
}

export function computeCardwellRsi(
  candles: Candle[],
  period = CARDWELL_PERIOD,
  pivot = CARDWELL_PIVOT,
): CardwellRsiState {
  const empty: CardwellRsiState = {
    bars: [],
    regime: "NEUTRAL",
    lastRsi: null,
    lastFastMa: null,
    lastSlowMa: null,
    levels: [],
    reversals: [],
  };
  if (candles.length < period + pivot * 2 + 2) return empty;

  const closes = candles.map((c) => num(c.close));
  const lows = candles.map((c) => num(c.low));
  const highs = candles.map((c) => num(c.high));
  const { rsi, avgGain, avgLoss } = wilderRsi(closes, period);
  const fastMa = wma(rsi, 9);
  const slowMa = wma(rsi, 45);

  const bars: CardwellRsiBar[] = candles.map((c, i) => ({
    openTime: c.open_time,
    close: closes[i],
    low: lows[i],
    high: highs[i],
    rsi: rsi[i],
    avgGain: avgGain[i],
    avgLoss: avgLoss[i],
    fastMa: fastMa[i],
    slowMa: slowMa[i],
  }));

  const last = bars.length - 1;
  const regime = classifyRegime(rsi, CARDWELL_REGIME_BARS);

  const levels: InverseRsiLevel[] = [];
  const ag = avgGain[last];
  const al = avgLoss[last];
  if (ag != null && al != null) {
    const rungs: Array<{ rsi: number; label: string }> = [
      { rsi: 80, label: "RSI 80" },
      { rsi: 70, label: "RSI 70" },
      { rsi: 60, label: "RSI 60" },
      { rsi: 50, label: "RSI 50" },
      { rsi: 40, label: "RSI 40" },
      { rsi: 30, label: "RSI 30" },
      { rsi: 20, label: "RSI 20" },
    ];
    for (const r of rungs) {
      const px = inverseRsiPrice(closes[last], ag, al, r.rsi, period);
      if (px != null) levels.push({ rsi: r.rsi, price: px, label: r.label });
    }
  }

  const reversals: CardwellReversal[] = [];
  const rsiNum: number[] = [];
  const rsiIdx: number[] = [];
  for (let i = 0; i < rsi.length; i++) {
    if (rsi[i] != null) {
      rsiNum.push(rsi[i] as number);
      rsiIdx.push(i);
    }
  }
  const lowPivots: number[] = [];
  const highPivots: number[] = [];
  for (let j = pivot; j < rsiNum.length - pivot; j++) {
    if (pivotLow(rsiNum, j, pivot, pivot)) lowPivots.push(j);
    if (pivotHigh(rsiNum, j, pivot, pivot)) highPivots.push(j);
  }

  for (let p = 1; p < lowPivots.length; p++) {
    const a = lowPivots[p - 1];
    const b = lowPivots[p];
    const ia = rsiIdx[a];
    const ib = rsiIdx[b];
    if (rsiNum[b] < rsiNum[a] && lows[ib] > lows[ia]) {
      const swingHigh = Math.max(...highs.slice(ia, ib + 1));
      const range = swingHigh - lows[ia];
      reversals.push({
        type: "PR",
        time: candles[ib].open_time,
        price: lows[ib],
        rsi: rsiNum[b],
        target: range > 0 ? lows[ib] + range : null,
      });
    }
  }
  for (let p = 1; p < highPivots.length; p++) {
    const a = highPivots[p - 1];
    const b = highPivots[p];
    const ia = rsiIdx[a];
    const ib = rsiIdx[b];
    if (rsiNum[b] > rsiNum[a] && highs[ib] < highs[ia]) {
      const swingLow = Math.min(...lows.slice(ia, ib + 1));
      const range = highs[ia] - swingLow;
      reversals.push({
        type: "NR",
        time: candles[ib].open_time,
        price: highs[ib],
        rsi: rsiNum[b],
        target: range > 0 ? highs[ib] - range : null,
      });
    }
  }

  return {
    bars,
    regime,
    lastRsi: rsi[last],
    lastFastMa: fastMa[last],
    lastSlowMa: slowMa[last],
    levels,
    reversals,
  };
}
