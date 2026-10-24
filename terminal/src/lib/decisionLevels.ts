/**
 * Extract structural Entry/SL/TP from decision setup — never invent SL or TP.
 */

import type { AiDecision } from "./decision";
import type { TradeSetup } from "./types";

export function levelsFromSetup(
  setup: TradeSetup,
  bullish: boolean,
): {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  rr: number | null;
} | null {
  const entry = (Number(setup.entry_zone.low) + Number(setup.entry_zone.high)) / 2;
  const stop = bullish ? Number(setup.stop_loss_zone.low) : Number(setup.stop_loss_zone.high);
  if (!(entry > 0) || !(stop > 0)) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  const engT1 = setup.target_zones?.[0]
    ? bullish
      ? Number(setup.target_zones[0].high)
      : Number(setup.target_zones[0].low)
    : null;
  if (engT1 == null || !Number.isFinite(engT1)) return null;
  const tp2 = setup.target_zones?.[1]
    ? bullish
      ? Number(setup.target_zones[1].high)
      : Number(setup.target_zones[1].low)
    : null;
  const rr = Math.abs(engT1 - entry) / risk;
  return { entry, stop, tp1: engT1, tp2, rr };
}

export function levelsFromDecision(decision: AiDecision): {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  rr: number | null;
} | null {
  const s = decision.setup;
  if (!s) return null;
  if (decision.direction === "buy" || (decision.direction === "wait" && decision.tone === "bull")) {
    return levelsFromSetup(s, true);
  }
  if (decision.direction === "sell" || (decision.direction === "wait" && decision.tone === "bear")) {
    return levelsFromSetup(s, false);
  }
  return null;
}
