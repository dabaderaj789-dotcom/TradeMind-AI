/**
 * Execution layer — Trade Card for actionable setups + WAIT triggers.
 * Does not replace analysis; sits above the AI desk.
 */

import type { AiDecision } from "./decision";
import { levelsFromSetup } from "./decisionLevels";
import { directionTone, num } from "./format";
import type { PredictivePlan } from "./predictiveSignal";
import type { Levels, OrderBlock, StructureEvents, TradeSetup } from "./types";

export type TradeQualityGrade = "A+" | "A" | "B" | "C";

export interface ExecutionTradeCard {
  mode: "trade" | "wait";
  side: "BUY" | "SELL" | "WAIT";
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  riskReward: number | null;
  confidence: number;
  quality: TradeQualityGrade;
  holdingTime: string;
  reasonLines: string[];
  nextBuyTrigger: string | null;
  nextSellTrigger: string | null;
  /** One line: Buy from X till Y / Sell from X till Y. */
  planLine: string | null;
}

function gradeQuality(
  confidence: number,
  inst: number,
  rr: number | null,
  strong: boolean,
  decision?: AiDecision,
): TradeQualityGrade {
  // Intraday Professional: explicit Early (B) / Confirmed (A) from engine
  if (decision?.intraday?.tradeGrade === "A") {
    return strong && confidence >= 82 ? "A+" : "A";
  }
  if (decision?.intraday?.tradeGrade === "B") return "B";
  if (strong && confidence >= 82 && inst >= 75 && (rr ?? 0) >= 2.5) return "A+";
  if (confidence >= 72 && inst >= 62 && (rr ?? 0) >= 2.0) return "A";
  if (confidence >= 58 && (rr ?? 0) >= 1.8) return "B";
  return "C";
}

function holdingForTf(tf: string): string {
  switch (tf) {
    case "1m":
      return "5–20 minutes (scalp)";
    case "3m":
      return "15–45 minutes";
    case "5m":
      return "20–90 minutes";
    case "15m":
      return "1–3 hours (intraday)";
    case "30m":
      return "2–6 hours";
    case "1h":
      return "Session swing";
    default:
      return "Intraday hold";
  }
}

function shortReasons(decision: AiDecision, max = 3): string[] {
  const lines: string[] = [];
  const pattern = decision.setupType;
  if (pattern && pattern !== "No active setup") lines.push(pattern);

  const hits = decision.qualityChecks.filter((c) => c.passed).map((c) => c.label);
  const prefer = ["BOS / CHoCH", "Order block", "Liquidity sweep", "Fair value gap", "Momentum", "Chart trend"];
  for (const p of prefer) {
    if (hits.some((h) => h.toLowerCase().includes(p.split(" ")[0].toLowerCase()) || h === p)) {
      const check = decision.qualityChecks.find((c) => c.label === p || c.label.includes(p.split(" ")[0]));
      if (check?.passed) {
        if (/bos|choch|structure/i.test(p)) lines.push("Structure confirmation in place.");
        else if (/order/i.test(p)) lines.push("Order Block respected.");
        else if (/sweep|liquidity/i.test(p)) lines.push("Liquidity sweep complete.");
        else if (/fvg|fair/i.test(p)) lines.push("FVG aligned with trade.");
        else if (/momentum/i.test(p)) lines.push("Momentum supports direction.");
      }
    }
    if (lines.length >= max) break;
  }

  // Fallback from evidence summary
  if (lines.length < 2) {
    for (const e of decision.evidenceSummary.slice(0, max - lines.length)) {
      lines.push(`${e} confirmed.`);
    }
  }
  if (lines.length < 2 && decision.explainability?.whyDirection) {
    const bite = decision.explainability.whyDirection.split(/[.|]/).map((s) => s.trim()).filter(Boolean);
    for (const b of bite) {
      if (b.length > 12 && b.length < 90) lines.push(b.endsWith(".") ? b : `${b}.`);
      if (lines.length >= max) break;
    }
  }
  return lines.slice(0, max);
}

function nearestLevel(levels: Levels | null | undefined, side: "support" | "resistance", price: number): number | null {
  if (!levels) return null;
  const arr = side === "support" ? levels.support_levels : levels.resistance_levels;
  if (!arr?.length) return null;
  const sorted = [...arr].sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  const pick =
    side === "support"
      ? sorted.find((l) => l.price < price) ?? sorted[0]
      : sorted.find((l) => l.price > price) ?? sorted[0];
  return pick?.price ?? null;
}

function nearestOb(obs: OrderBlock[] | undefined, bullish: boolean, price: number): OrderBlock | null {
  if (!obs?.length) return null;
  const side = bullish ? "bull" : "bear";
  const pool = obs.filter((o) => (o.type ?? "").toLowerCase().includes(side));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => {
    const ma = (a.zone_high + a.zone_low) / 2;
    const mb = (b.zone_high + b.zone_low) / 2;
    return Math.abs(ma - price) - Math.abs(mb - price);
  })[0];
}

function buildWaitTriggers(opts: {
  decision: AiDecision;
  lastPrice: number;
  levels?: Levels | null;
  orderBlocks?: OrderBlock[];
  structure?: StructureEvents | null;
  setup?: TradeSetup | null;
}): { buy: string; sell: string } {
  const { decision, lastPrice, levels, orderBlocks, structure, setup } = opts;
  const px = lastPrice > 0 ? lastPrice : 0;
  const res = nearestLevel(levels, "resistance", px);
  const sup = nearestLevel(levels, "support", px);
  const bullOb = nearestOb(orderBlocks, true, px);
  const bearOb = nearestOb(orderBlocks, false, px);

  const unlock = decision.unlockConditions ?? [];
  const needBos = unlock.some((u) => /bos|structure|choch/i.test(u));
  const needSweep = unlock.some((u) => /sweep|liquidity/i.test(u));
  const needOb = unlock.some((u) => /order block|ob retest/i.test(u));

  const bosHint = structure?.bos_events?.length
    ? "with bullish BOS confirmation"
    : needBos
      ? "with bullish BOS confirmation"
      : "and hold";

  const buyLevel =
    (bullOb ? bullOb.zone_high : null) ??
    res ??
    (setup?.direction === "buy" ? num(setup.entry_zone.high) : null) ??
    (px > 0 ? px * 1.0012 : null);

  const sellLevel =
    (bearOb ? bearOb.zone_low : null) ??
    sup ??
    (setup?.direction === "sell" ? num(setup.entry_zone.low) : null) ??
    (px > 0 ? px * 0.9988 : null);

  const buyExtra = needSweep
    ? " after liquidity sweep"
    : needOb
      ? " from bullish Order Block"
      : "";
  const sellExtra = needSweep
    ? " after liquidity sweep"
    : needOb
      ? " from bearish Order Block"
      : "";

  const buy =
    buyLevel != null && buyLevel > 0
      ? `Close above ${fmt(buyLevel)} ${bosHint}${buyExtra}.`
      : needBos
        ? "Bullish BOS confirmation on this timeframe, then enter on OB retest."
        : "Bullish BOS + close above nearest resistance with volume.";

  const sell =
    sellLevel != null && sellLevel > 0
      ? `Close below ${fmt(sellLevel)}${sellExtra}${needBos ? " with bearish BOS confirmation" : ""}.`
      : needBos
        ? "Bearish BOS / CHoCH confirmation, then enter on bearish OB rejection."
        : "Bearish BOS + close below nearest support after liquidity sweep.";

  return { buy, sell };
}

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (n >= 100) return n.toFixed(2);
  return n.toFixed(4);
}

function planLineFor(
  decision: AiDecision,
  side: "BUY" | "SELL" | null,
  entry: number | null,
  target: number | null,
): string | null {
  const setup = decision.setup;
  const tone =
    side === "BUY" ? "bull" : side === "SELL" ? "bear" : directionTone(setup?.direction ?? decision.direction);
  if (tone !== "bull" && tone !== "bear") return null;
  const bull = tone === "bull";
  const levels = setup ? levelsFromSetup(setup, bull) : null;
  const from =
    setup != null
      ? bull
        ? num(setup.entry_zone.low)
        : num(setup.entry_zone.high)
      : entry;
  const till = levels?.tp1 ?? target;
  if (from == null || !(from > 0) || till == null || !(till > 0)) return null;
  return `${bull ? "Buy" : "Sell"} from ${fmt(from)} till ${fmt(till)}`;
}

/**
 * Build the execution Trade Card from the current decision + plan.
 */
export function deriveExecutionCard(opts: {
  decision: AiDecision;
  plan: PredictivePlan | null;
  timeframe: string;
  lastPrice: number;
  levels?: Levels | null;
  orderBlocks?: OrderBlock[];
  structure?: StructureEvents | null;
}): ExecutionTradeCard {
  const { decision, plan, timeframe, lastPrice, levels, orderBlocks, structure } = opts;
  const actionable = decision.actionable && (decision.kind.includes("BUY") || decision.kind.includes("SELL"));
  const strong = decision.kind.startsWith("STRONG");
  const rr = plan?.riskReward ?? decision.signalQuality?.riskReward ?? null;
  const quality = gradeQuality(decision.confidence, decision.institutional?.score ?? 0, rr, strong, decision);

  if (actionable) {
    const side = decision.kind.includes("BUY") ? "BUY" : "SELL";
    const setup = decision.setup;
    const entry =
      plan?.entry ??
      (setup ? (num(setup.entry_zone.low) + num(setup.entry_zone.high)) / 2 : null);
    const stop =
      plan?.stop ??
      (setup
        ? side === "BUY"
          ? num(setup.stop_loss_zone.low)
          : num(setup.stop_loss_zone.high)
        : null);
    const risk = entry != null && stop != null ? Math.abs(entry - stop) : 0;
    const tp1 =
      plan?.target1 ??
      (entry != null && risk > 0 ? (side === "BUY" ? entry + 2 * risk : entry - 2 * risk) : null);
    const tp2 =
      plan?.target2 ??
      (entry != null && risk > 0 ? (side === "BUY" ? entry + 3 * risk : entry - 3 * risk) : null);
    const tp3 =
      plan?.target3 ??
      (entry != null && risk > 0 ? (side === "BUY" ? entry + 4 * risk : entry - 4 * risk) : null);
    const computedRr = entry != null && risk > 0 && tp1 != null ? Math.abs(tp1 - entry) / risk : rr;

    if (entry != null && stop != null && tp1 != null) {
      return {
        mode: "trade",
        side,
        entry,
        stop,
        tp1,
        tp2,
        tp3,
        riskReward: computedRr,
        confidence: Math.round(decision.confidence),
        quality: gradeQuality(decision.confidence, decision.institutional?.score ?? 0, computedRr, strong, decision),
        holdingTime: holdingForTf(timeframe),
        reasonLines: [
          ...(decision.intraday
            ? [
                decision.intraday.setupLevel === "early"
                  ? `Early Setup (B) · size ${Math.round(decision.intraday.positionScale * 100)}%`
                  : "Confirmed Setup (A) · normal size",
              ]
            : []),
          ...shortReasons(decision, decision.intraday ? 2 : 3),
        ].slice(0, 4),
        nextBuyTrigger: null,
        nextSellTrigger: null,
        planLine: planLineFor(decision, side, entry, tp1),
      };
    }
  }

  // WAIT — show next triggers
  const triggers = buildWaitTriggers({
    decision,
    lastPrice,
    levels,
    orderBlocks,
    structure,
    setup: decision.setup,
  });

  return {
    mode: "wait",
    side: "WAIT",
    entry: null,
    stop: null,
    tp1: null,
    tp2: null,
    tp3: null,
    riskReward: null,
    confidence: Math.round(decision.confidence),
    quality,
    holdingTime: holdingForTf(timeframe),
    reasonLines: shortReasons(decision, 2).length
      ? shortReasons(decision, 2)
      : ["No executable confluence yet — prepare for the triggers below."],
    nextBuyTrigger: triggers.buy,
    nextSellTrigger: triggers.sell,
    planLine: planLineFor(decision, null, null, null),
  };
}
