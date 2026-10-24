/**
 * Intraday Professional — early discretionary pattern detectors.
 *
 * These raise probability BEFORE institutional BOS confirmation.
 * Used only by the Intraday profile (Level 1 / Early Setup).
 */

import { num } from "./format";
import type { AnalysisBar, Candle, Levels, StructureEvents } from "./types";

export type EarlyPatternId =
  | "lower_high_continuation"
  | "higher_low_continuation"
  | "trendline_rejection"
  | "weak_pullback"
  | "momentum_exhaustion"
  | "support_breakdown"
  | "resistance_breakout"
  | "multi_rejection_candles"
  | "failure_to_reclaim"
  | "vwap_rejection"
  | "ema_rejection"
  | "volume_expansion_breakdown"
  | "volume_expansion_breakout";

export interface EarlyPatternHit {
  id: EarlyPatternId;
  label: string;
  direction: "buy" | "sell";
  weight: number;
  detail: string;
}

export interface EarlyPatternScan {
  hits: EarlyPatternHit[];
  /** Weighted score 0–100 from early evidence alone. */
  score: number;
  preferredDirection: "buy" | "sell" | "wait";
  summary: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function pivotHighs(candles: Candle[], left = 2, right = 2): { i: number; price: number }[] {
  const out: { i: number; price: number }[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const h = num(candles[i].high);
    let ok = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (num(candles[j].high) >= h) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ i, price: h });
  }
  return out;
}

function pivotLows(candles: Candle[], left = 2, right = 2): { i: number; price: number }[] {
  const out: { i: number; price: number }[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const l = num(candles[i].low);
    let ok = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (num(candles[j].low) <= l) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ i, price: l });
  }
  return out;
}

function isBearishRejection(c: Candle): boolean {
  const o = num(c.open);
  const h = num(c.high);
  const l = num(c.low);
  const cl = num(c.close);
  const range = h - l;
  if (range <= 0) return false;
  const upper = h - Math.max(o, cl);
  const body = Math.abs(cl - o);
  return upper / range >= 0.45 && body / range <= 0.4 && cl <= o;
}

function isBullishRejection(c: Candle): boolean {
  const o = num(c.open);
  const h = num(c.high);
  const l = num(c.low);
  const cl = num(c.close);
  const range = h - l;
  if (range <= 0) return false;
  const lower = Math.min(o, cl) - l;
  const body = Math.abs(cl - o);
  return lower / range >= 0.45 && body / range <= 0.4 && cl >= o;
}

function atr(candles: Candle[], lookback = 14): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-Math.min(lookback + 1, candles.length));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const h = num(slice[i].high);
    const l = num(slice[i].low);
    const pc = num(slice[i - 1].close);
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    n += 1;
  }
  return n ? sum / n : 0;
}

function sessionVwapFromCandles(candles: Candle[]): number | null {
  if (candles.length < 5) return null;
  // Approximate session VWAP from last ~78 bars (≈1 trading day on 5m)
  const slice = candles.slice(-78);
  let pv = 0;
  let vol = 0;
  for (const c of slice) {
    const typical = (num(c.high) + num(c.low) + num(c.close)) / 3;
    const v = Math.max(num(c.volume), 1);
    pv += typical * v;
    vol += v;
  }
  return vol > 0 ? pv / vol : null;
}

function lastAnalysisValue(bars: AnalysisBar[] | undefined): number | null {
  if (!bars?.length) return null;
  const vals = bars[bars.length - 1]?.values;
  if (!vals || typeof vals !== "object") return null;
  const raw =
    (vals as Record<string, unknown>).ema ??
    (vals as Record<string, unknown>).value ??
    (vals as Record<string, unknown>).vwap ??
    (vals as Record<string, unknown>).close;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Scan candles (+ optional EMA/VWAP/levels/structure) for early discretionary tells.
 */
export function scanEarlyPatterns(opts: {
  candles: Candle[];
  levels?: Levels | null;
  structureEvents?: StructureEvents | null;
  emaBars?: AnalysisBar[] | null;
  vwapBars?: AnalysisBar[] | null;
  emaEnabled?: boolean;
  vwapEnabled?: boolean;
}): EarlyPatternScan {
  const { candles, levels, structureEvents, emaBars, vwapBars, emaEnabled, vwapEnabled } = opts;
  const hits: EarlyPatternHit[] = [];
  if (candles.length < 12) {
    return { hits, score: 0, preferredDirection: "wait", summary: "Insufficient bars for early patterns" };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const px = num(last.close);
  const a = atr(candles);
  const highs = pivotHighs(candles);
  const lows = pivotLows(candles);
  const lastHighs = highs.slice(-3);
  const lastLows = lows.slice(-3);

  // Lower High continuation (bearish)
  if (lastHighs.length >= 2 && lastHighs[lastHighs.length - 1].price < lastHighs[lastHighs.length - 2].price) {
    const momDown = px < num(candles[candles.length - 6].close);
    if (momDown || num(last.close) < num(last.open)) {
      hits.push({
        id: "lower_high_continuation",
        label: "Lower High continuation",
        direction: "sell",
        weight: 1.3,
        detail: `LH sequence (${lastHighs[lastHighs.length - 2].price.toFixed(1)} → ${lastHighs[lastHighs.length - 1].price.toFixed(1)})`,
      });
    }
  }

  // Higher Low continuation (bullish)
  if (lastLows.length >= 2 && lastLows[lastLows.length - 1].price > lastLows[lastLows.length - 2].price) {
    const momUp = px > num(candles[candles.length - 6].close);
    if (momUp || num(last.close) > num(last.open)) {
      hits.push({
        id: "higher_low_continuation",
        label: "Higher Low continuation",
        direction: "buy",
        weight: 1.3,
        detail: `HL sequence (${lastLows[lastLows.length - 2].price.toFixed(1)} → ${lastLows[lastLows.length - 1].price.toFixed(1)})`,
      });
    }
  }

  // Trendline / supply rejection (approx: touch near recent pivot high + bearish rejection)
  if (lastHighs.length && isBearishRejection(last)) {
    const ph = lastHighs[lastHighs.length - 1].price;
    if (Math.abs(num(last.high) - ph) <= a * 0.6 || num(last.high) >= ph * 0.998) {
      hits.push({
        id: "trendline_rejection",
        label: "Trendline / supply rejection",
        direction: "sell",
        weight: 1.2,
        detail: `Rejection near ${ph.toFixed(1)}`,
      });
    }
  }
  if (lastLows.length && isBullishRejection(last)) {
    const pl = lastLows[lastLows.length - 1].price;
    if (Math.abs(num(last.low) - pl) <= a * 0.6 || num(last.low) <= pl * 1.002) {
      hits.push({
        id: "trendline_rejection",
        label: "Trendline / demand rejection",
        direction: "buy",
        weight: 1.2,
        detail: `Rejection near ${pl.toFixed(1)}`,
      });
    }
  }

  // Weak pullback after impulse
  const impulseLook = candles.slice(-10);
  const impulseHigh = Math.max(...impulseLook.map((c) => num(c.high)));
  const impulseLow = Math.min(...impulseLook.map((c) => num(c.low)));
  const impulseRange = impulseHigh - impulseLow;
  if (impulseRange > a * 1.2) {
    const fromLow = px - impulseLow;
    const fromHigh = impulseHigh - px;
    // Bearish impulse then weak bounce (shallow retrace)
    if (num(impulseLook[0].close) > num(impulseLook[impulseLook.length - 1].close)) {
      const retrace = fromLow / impulseRange;
      if (retrace > 0 && retrace <= 0.38 && num(last.close) < num(last.open)) {
        hits.push({
          id: "weak_pullback",
          label: "Weak pullback",
          direction: "sell",
          weight: 1.15,
          detail: `Shallow bounce ${(retrace * 100).toFixed(0)}% of impulse — sellers still in control`,
        });
      }
    } else {
      const retrace = fromHigh / impulseRange;
      if (retrace > 0 && retrace <= 0.38 && num(last.close) > num(last.open)) {
        hits.push({
          id: "weak_pullback",
          label: "Weak pullback",
          direction: "buy",
          weight: 1.15,
          detail: `Shallow dip ${(retrace * 100).toFixed(0)}% of impulse — buyers still in control`,
        });
      }
    }
  }

  // Momentum exhaustion (climax wick against prior move)
  const prior = candles.slice(-8, -1);
  const priorUp = num(prior[prior.length - 1].close) > num(prior[0].close);
  if (priorUp && isBearishRejection(last) && num(last.high) >= Math.max(...prior.map((c) => num(c.high)))) {
    hits.push({
      id: "momentum_exhaustion",
      label: "Momentum exhaustion",
      direction: "sell",
      weight: 1.1,
      detail: "Buying climax wick after up-leg",
    });
  }
  if (!priorUp && isBullishRejection(last) && num(last.low) <= Math.min(...prior.map((c) => num(c.low)))) {
    hits.push({
      id: "momentum_exhaustion",
      label: "Momentum exhaustion",
      direction: "buy",
      weight: 1.1,
      detail: "Selling climax wick after down-leg",
    });
  }

  // Support breakdown / resistance breakout
  const support = levels?.support_levels?.slice().sort((a, b) => Math.abs(a.price - px) - Math.abs(b.price - px))[0];
  const resistance = levels?.resistance_levels
    ?.slice()
    .sort((a, b) => Math.abs(a.price - px) - Math.abs(b.price - px))[0];
  if (support && px < support.price && num(prev.close) >= support.price * 0.999) {
    hits.push({
      id: "support_breakdown",
      label: "Support breakdown",
      direction: "sell",
      weight: 1.35,
      detail: `Close below support ${support.price.toFixed(1)}`,
    });
  }
  if (resistance && px > resistance.price && num(prev.close) <= resistance.price * 1.001) {
    hits.push({
      id: "resistance_breakout",
      label: "Resistance breakout",
      direction: "buy",
      weight: 1.35,
      detail: `Close above resistance ${resistance.price.toFixed(1)}`,
    });
  }
  // Structure swing break without requiring BOS event label
  const recentBos = structureEvents?.bos_events?.slice(-2) ?? [];
  void recentBos;
  if (lastLows.length >= 1) {
    const swingLow = lastLows[lastLows.length - 1].price;
    if (px < swingLow && num(prev.low) >= swingLow) {
      hits.push({
        id: "support_breakdown",
        label: "Swing support break",
        direction: "sell",
        weight: 1.25,
        detail: `Broke prior swing low ${swingLow.toFixed(1)}`,
      });
    }
  }
  if (lastHighs.length >= 1) {
    const swingHigh = lastHighs[lastHighs.length - 1].price;
    if (px > swingHigh && num(prev.high) <= swingHigh) {
      hits.push({
        id: "resistance_breakout",
        label: "Swing resistance break",
        direction: "buy",
        weight: 1.25,
        detail: `Broke prior swing high ${swingHigh.toFixed(1)}`,
      });
    }
  }

  // Multiple rejection candles
  const last3 = candles.slice(-3);
  const bearRej = last3.filter(isBearishRejection).length;
  const bullRej = last3.filter(isBullishRejection).length;
  if (bearRej >= 2) {
    hits.push({
      id: "multi_rejection_candles",
      label: "Multiple bearish rejection candles",
      direction: "sell",
      weight: 1.2,
      detail: `${bearRej}/3 recent bars rejected higher`,
    });
  }
  if (bullRej >= 2) {
    hits.push({
      id: "multi_rejection_candles",
      label: "Multiple bullish rejection candles",
      direction: "buy",
      weight: 1.2,
      detail: `${bullRej}/3 recent bars rejected lower`,
    });
  }

  // Failure to reclaim previous swing
  if (lastHighs.length >= 1) {
    const sh = lastHighs[lastHighs.length - 1].price;
    const brokeBelow = candles.slice(-6).some((c) => num(c.close) < sh);
    const failedReclaim = brokeBelow && num(last.high) >= sh * 0.998 && num(last.close) < sh;
    if (failedReclaim) {
      hits.push({
        id: "failure_to_reclaim",
        label: "Failure to reclaim swing",
        direction: "sell",
        weight: 1.3,
        detail: `Failed reclaim of ${sh.toFixed(1)}`,
      });
    }
  }
  if (lastLows.length >= 1) {
    const sl = lastLows[lastLows.length - 1].price;
    const brokeAbove = candles.slice(-6).some((c) => num(c.close) > sl);
    const failedReclaim = brokeAbove && num(last.low) <= sl * 1.002 && num(last.close) > sl;
    if (failedReclaim) {
      hits.push({
        id: "failure_to_reclaim",
        label: "Failure to reclaim swing",
        direction: "buy",
        weight: 1.3,
        detail: `Failed reclaim of ${sl.toFixed(1)}`,
      });
    }
  }

  // VWAP rejection
  const vwap =
    vwapEnabled !== false
      ? (lastAnalysisValue(vwapBars ?? undefined) ?? sessionVwapFromCandles(candles))
      : null;
  if (vwap != null && a > 0) {
    const dist = px - vwap;
    if (dist > 0 && dist <= a * 0.35 && isBearishRejection(last)) {
      hits.push({
        id: "vwap_rejection",
        label: "VWAP rejection",
        direction: "sell",
        weight: 1.15,
        detail: `Rejected at VWAP ${vwap.toFixed(1)}`,
      });
    }
    if (dist < 0 && Math.abs(dist) <= a * 0.35 && isBullishRejection(last)) {
      hits.push({
        id: "vwap_rejection",
        label: "VWAP rejection",
        direction: "buy",
        weight: 1.15,
        detail: `Rejected at VWAP ${vwap.toFixed(1)}`,
      });
    }
  }

  // EMA rejection (only when overlay/data enabled)
  const ema = emaEnabled ? lastAnalysisValue(emaBars ?? undefined) : null;
  if (ema != null && a > 0) {
    const dist = px - ema;
    if (Math.abs(dist) <= a * 0.4) {
      if (dist >= 0 && isBearishRejection(last)) {
        hits.push({
          id: "ema_rejection",
          label: "EMA rejection",
          direction: "sell",
          weight: 1.05,
          detail: `Rejected at EMA ${ema.toFixed(1)}`,
        });
      }
      if (dist <= 0 && isBullishRejection(last)) {
        hits.push({
          id: "ema_rejection",
          label: "EMA rejection",
          direction: "buy",
          weight: 1.05,
          detail: `Rejected at EMA ${ema.toFixed(1)}`,
        });
      }
    }
  }

  // Volume expansion on breakdown / breakout
  const vols = candles.slice(-20).map((c) => num(c.volume));
  const avgVol = vols.reduce((s, v) => s + v, 0) / Math.max(vols.length, 1);
  const lastVol = vols[vols.length - 1] ?? 0;
  if (avgVol > 0 && lastVol >= avgVol * 1.45) {
    if (num(last.close) < num(last.open) && px < num(candles[candles.length - 5].close)) {
      hits.push({
        id: "volume_expansion_breakdown",
        label: "Volume expansion on breakdown",
        direction: "sell",
        weight: 1.2,
        detail: `Volume ${(lastVol / avgVol).toFixed(1)}× average on down move`,
      });
    }
    if (num(last.close) > num(last.open) && px > num(candles[candles.length - 5].close)) {
      hits.push({
        id: "volume_expansion_breakout",
        label: "Volume expansion on breakout",
        direction: "buy",
        weight: 1.2,
        detail: `Volume ${(lastVol / avgVol).toFixed(1)}× average on up move`,
      });
    }
  }

  // Deduplicate by id+direction (keep highest weight)
  const dedup = new Map<string, EarlyPatternHit>();
  for (const h of hits) {
    const key = `${h.id}:${h.direction}`;
    const prevHit = dedup.get(key);
    if (!prevHit || h.weight > prevHit.weight) dedup.set(key, h);
  }
  const unique = [...dedup.values()];

  const sellW = unique.filter((h) => h.direction === "sell").reduce((s, h) => s + h.weight, 0);
  const buyW = unique.filter((h) => h.direction === "buy").reduce((s, h) => s + h.weight, 0);
  const preferredDirection: "buy" | "sell" | "wait" =
    sellW >= 2.2 && sellW > buyW * 1.15
      ? "sell"
      : buyW >= 2.2 && buyW > sellW * 1.15
        ? "buy"
        : "wait";

  const aligned = unique.filter((h) => preferredDirection === "wait" || h.direction === preferredDirection);
  const maxW = 8;
  const score = clamp(Math.round((aligned.reduce((s, h) => s + h.weight, 0) / maxW) * 100), 0, 100);

  const summary =
    preferredDirection === "wait"
      ? unique.length
        ? `Early evidence mixed (${unique.length} tells) — no clear side yet`
        : "No early discretionary tells"
      : `${preferredDirection === "sell" ? "Bearish" : "Bullish"} early tells: ${aligned
          .slice(0, 4)
          .map((h) => h.label)
          .join(", ")}`;

  return { hits: unique, score, preferredDirection, summary };
}
