/**
 * Frozen decision-state snapshot at decision time T.
 * Outcome fields are separate and must never rewrite this snapshot.
 */

import type { AiDecision } from "./decision";
import type { DecisionProfileId } from "./decisionProfiles";
import type { Candle, Levels, StructureEvents, Trend } from "./types";
import type { ExpiryIntelligence } from "./expiryIntelligence";
import type { LateSessionSetup } from "./lateSessionIntelligence";
import { levelsFromDecision } from "./decisionLevels";
import { num } from "./format";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface OptionChainFreeze {
  asOf: string | null;
  underlying: string;
  expiry: string | null;
  atmStrike: number | null;
  spot: number | null;
  feedState: "LIVE" | "STALE" | "DISCONNECTED" | "UNAVAILABLE";
  /** ATM CE/PE snapshot only — frozen at decision time. */
  atmCallLtp: number | null;
  atmPutLtp: number | null;
  atmCallOi: number | null;
  atmPutOi: number | null;
  atmCallOiChange: number | null;
  atmPutOiChange: number | null;
  atmCallIv: number | null;
  atmPutIv: number | null;
  source: string | null;
}

/** Immutable market + AI state as known at decision timestamp. */
export interface DecisionStateSnapshot {
  /** ISO UTC when decision was logged. */
  tsUtc: string;
  /** IST wall-clock string HH:MM:SS. */
  tsIst: string;
  symbolId: string;
  symbolCode: string;
  timeframe: string;
  profile: DecisionProfileId;
  spot: number;
  candle: {
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    openTime: string | null;
  };
  vwap: number | null;
  personality: string | null;
  personalityBias: string | null;
  trend: string | null;
  structure: string | null;
  bos: boolean;
  choch: boolean;
  liquidity: string | null;
  orderBlock: string | null;
  fvg: string | null;
  momentum: string | null;
  relativeVolume: number | null;
  expiryActive: boolean;
  expiryDayClass: string | null;
  optionChain: OptionChainFreeze | null;
  decision: string;
  direction: "buy" | "sell" | "wait";
  earlyOrConfirmed: "early" | "confirmed" | null;
  confidence: number | null;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  /** Hypothetical next BUY trigger from unlock / early evidence (not a live order). */
  nextBuyTrigger: number | null;
  nextSellTrigger: number | null;
  reason: string;
  unlock: string[];
  /** True if Early setup evidence existed while WAIT. */
  hadEarlySetupEvidence: boolean;
  /** True if Confirmed path was nearly there / blocked. */
  hadConfirmedPathBlocked: boolean;
  lateSessionClass: string | null;
  /** Candle open_time of last bar used — proves cutoff. */
  asOfCandleOpenTime: string | null;
}

export interface ValidationOutcome {
  movePts: number | null;
  mfe: number | null;
  mae: number | null;
  /** Ladder hits for favorable move in hypothetical or trade direction. */
  thresholdsHit: number[];
  timeTo10Ms: number | null;
  timeTo15Ms: number | null;
  timeTo20Ms: number | null;
  timeTo25Ms: number | null;
  /** Entry trigger reached after WAIT. */
  entryTriggerReached: boolean;
  /** Favorable move started before confirmation conditions met. */
  moveBeforeConfirmation: boolean | null;
  /** Still tradable after confirmation arrived (price still near entry). */
  tradableAfterConfirmation: boolean | null;
  /**
   * Missed only if: WAIT + valid executable setup existed + favorable ≥ threshold.
   * Price move alone is NOT enough.
   */
  validSetupExisted: boolean;
  missed: boolean | null;
  missReason: string | null;
}

function istClock(d = new Date()): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function relativeVolume(candles: Candle[]): number | null {
  if (candles.length < 20) return null;
  const vols = candles.map((c) => num(c.volume));
  const last = vols[vols.length - 1] ?? 0;
  const avg = vols.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, vols.length - 1);
  return avg > 0 ? Math.round((last / avg) * 100) / 100 : null;
}

function approxVwap(candles: Candle[]): number | null {
  let pv = 0;
  let v = 0;
  for (const c of candles.slice(-80)) {
    const typ = (num(c.high) + num(c.low) + num(c.close)) / 3;
    const vol = Math.max(num(c.volume), 1);
    pv += typ * vol;
    v += vol;
  }
  return v > 0 ? Math.round((pv / v) * 100) / 100 : null;
}

function recentBosChoch(events: StructureEvents | null | undefined): { bos: boolean; choch: boolean; label: string } {
  const bosList = events?.bos_events ?? [];
  const chochList = events?.choch_events ?? [];
  const bos = bosList.length > 0;
  const choch = chochList.length > 0;
  const lastBos = bosList[bosList.length - 1];
  const lastChoch = chochList[chochList.length - 1];
  const last = lastChoch ?? lastBos;
  const label = last
    ? `${last.event_type} @ ${last.break_price}`
    : "—";
  return { bos, choch, label };
}

function checkDetail(decision: AiDecision, re: RegExp): string | null {
  const c = decision.qualityChecks.find((q) => re.test(q.id + q.label));
  if (!c) return null;
  return c.passed ? "aligned" : c.detail || "missing";
}

/**
 * Build a frozen snapshot from data available NOW.
 * Caller must pass candles already cut off at decision time (no future bars).
 */
export function freezeDecisionState(opts: {
  symbolId: string;
  symbolCode: string;
  timeframe: string;
  profile: DecisionProfileId;
  price: number;
  decision: AiDecision;
  candles: Candle[];
  trend?: Trend | null;
  structureEvents?: StructureEvents | null;
  levels?: Levels | null;
  expiry?: ExpiryIntelligence | null;
  lateSession?: LateSessionSetup | null;
  optionChain?: OptionChainFreeze | null;
  now?: Date;
}): DecisionStateSnapshot {
  const now = opts.now ?? new Date();
  const last = opts.candles[opts.candles.length - 1];
  const lv = levelsFromDecision(opts.decision);
  const struct = recentBosChoch(opts.structureEvents);
  const earlyScore =
    opts.decision.intraday?.earlyScore ?? opts.decision.signalQuality?.tradeQualityScore ?? 0;
  const hadEarly =
    earlyScore >= 35 ||
    (opts.decision.intraday?.earlyPatterns?.length ?? 0) >= 2 ||
    opts.decision.intraday?.setupLevel === "early";
  const hadConfirmedBlocked =
    !opts.decision.actionable &&
    (opts.decision.unlockConditions?.some((u) => /bos|choch|confirm|r:r|rr|structure/i.test(u)) ??
      false);

  // Next triggers: structural entry mid from setup if WAIT, else null
  let nextBuy: number | null = null;
  let nextSell: number | null = null;
  const setup = opts.decision.setup;
  if (setup && !opts.decision.actionable) {
    const mid = (num(setup.entry_zone.low) + num(setup.entry_zone.high)) / 2;
    if (opts.decision.tone === "bull" || /buy/i.test(opts.decision.unlockConditions?.join(" ") ?? "")) {
      nextBuy = mid > 0 ? mid : null;
    }
    if (opts.decision.tone === "bear" || /sell/i.test(opts.decision.unlockConditions?.join(" ") ?? "")) {
      nextSell = mid > 0 ? mid : null;
    }
  }
  if (opts.decision.actionable && lv) {
    if (opts.decision.direction === "buy") nextBuy = lv.entry;
    if (opts.decision.direction === "sell") nextSell = lv.entry;
  }

  // Deep-freeze option chain copy (plain JSON) — never mutate later
  const oc = opts.optionChain
    ? (JSON.parse(JSON.stringify(opts.optionChain)) as OptionChainFreeze)
    : null;

  return {
    tsUtc: now.toISOString(),
    tsIst: istClock(now),
    symbolId: opts.symbolId,
    symbolCode: opts.symbolCode,
    timeframe: opts.timeframe,
    profile: opts.profile,
    spot: opts.price,
    candle: {
      open: last ? num(last.open) : null,
      high: last ? num(last.high) : null,
      low: last ? num(last.low) : null,
      close: last ? num(last.close) : null,
      volume: last ? num(last.volume) : null,
      openTime: last?.open_time ?? null,
    },
    vwap: approxVwap(opts.candles),
    personality: opts.decision.personality?.label ?? null,
    personalityBias: opts.decision.personality?.bias ?? null,
    trend: opts.trend?.trend ?? opts.decision.trendLabel ?? null,
    structure: struct.label,
    bos: struct.bos,
    choch: struct.choch,
    liquidity: opts.decision.marketHealth?.liquidity ?? null,
    orderBlock: checkDetail(opts.decision, /order.?block|ob/i),
    fvg: checkDetail(opts.decision, /fvg|fair.?value/i),
    momentum: checkDetail(opts.decision, /momentum/),
    relativeVolume: relativeVolume(opts.candles),
    expiryActive: !!opts.expiry?.active,
    expiryDayClass: opts.expiry?.dayClass ?? null,
    optionChain: oc,
    decision: opts.decision.kind,
    direction: opts.decision.direction,
    earlyOrConfirmed: opts.decision.intraday?.setupLevel ?? null,
    confidence: opts.decision.confidence ?? null,
    entry: lv?.entry ?? null,
    stop: lv?.stop ?? null,
    tp1: lv?.tp1 ?? null,
    tp2: lv?.tp2 ?? null,
    rr: lv?.rr ?? opts.decision.signalQuality?.riskReward ?? null,
    nextBuyTrigger: nextBuy,
    nextSellTrigger: nextSell,
    reason:
      opts.decision.explainability?.whyDirection ||
      opts.decision.reasoning?.slice(0, 240) ||
      "—",
    unlock: opts.decision.unlockConditions?.slice(0, 6) ?? [],
    hadEarlySetupEvidence: hadEarly,
    hadConfirmedPathBlocked: hadConfirmedBlocked,
    lateSessionClass: opts.lateSession?.classification ?? null,
    asOfCandleOpenTime: last?.open_time ?? null,
  };
}

/** Assert snapshot candle as-of is not after decision time (no future bar). */
export function assertSnapshotNoFuture(
  snap: DecisionStateSnapshot,
  decisionMs: number,
): { ok: boolean; detail: string } {
  if (!snap.asOfCandleOpenTime) return { ok: true, detail: "no candle timestamp" };
  const t = Date.parse(snap.asOfCandleOpenTime);
  if (!Number.isFinite(t)) return { ok: false, detail: "bad candle time" };
  if (t > decisionMs + 1000) {
    return { ok: false, detail: `candle ${snap.asOfCandleOpenTime} after decision` };
  }
  return { ok: true, detail: "ok" };
}
