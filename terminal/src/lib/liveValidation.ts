/**
 * Live Validation Mode — frozen decision state at T + separate outcome tracking.
 * Outcome updates MUST NOT rewrite the frozen snapshot.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiDecision } from "./decision";
import type { DecisionProfileId } from "./decisionProfiles";
import type { Candle, Levels, StructureEvents, Trend } from "./types";
import type { ExpiryIntelligence } from "./expiryIntelligence";
import type { LateSessionSetup } from "./lateSessionIntelligence";
import {
  freezeDecisionState,
  type DecisionStateSnapshot,
  type OptionChainFreeze,
  type ValidationOutcome,
} from "./validationSnapshot";
import { useOptionChainFreeze } from "./optionChainFreeze";

export const MISS_LADDERS = [10, 15, 20, 25] as const;

export interface ValidationEvent {
  id: string;
  /** Frozen at decision time — never mutated after create. */
  snapshot: DecisionStateSnapshot;
  /** Mutable outcome — updated by price ticks only. */
  outcome: ValidationOutcome;
}

interface ValidationState {
  enabled: boolean;
  events: ValidationEvent[];
  setEnabled: (on: boolean) => void;
  logDecision: (opts: {
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
  }) => void;
  tickPrice: (symbolId: string, timeframe: string, price: number) => void;
  clearDay: () => void;
}

function dayPrefix() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyOutcome(): ValidationOutcome {
  return {
    movePts: null,
    mfe: 0,
    mae: 0,
    thresholdsHit: [],
    timeTo10Ms: null,
    timeTo15Ms: null,
    timeTo20Ms: null,
    timeTo25Ms: null,
    entryTriggerReached: false,
    moveBeforeConfirmation: null,
    tradableAfterConfirmation: null,
    validSetupExisted: false,
    missed: null,
    missReason: null,
  };
}

function validExecutableSetup(snap: DecisionStateSnapshot): boolean {
  // Must have had Early or Confirmed path evidence AND a concrete trigger level
  const trigger =
    snap.direction === "sell" || snap.personalityBias === "bear"
      ? snap.nextSellTrigger
      : snap.direction === "buy" || snap.personalityBias === "bull"
        ? snap.nextBuyTrigger
        : snap.nextBuyTrigger ?? snap.nextSellTrigger;
  if (snap.decision !== "WAIT" && snap.decision !== "wait") {
    // Actionable already was a valid setup
    return snap.earlyOrConfirmed != null && snap.entry != null && snap.stop != null;
  }
  return (
    (snap.hadEarlySetupEvidence || snap.hadConfirmedPathBlocked) &&
    trigger != null &&
    trigger > 0
  );
}

function updateOutcome(
  snap: DecisionStateSnapshot,
  prev: ValidationOutcome,
  price: number,
): ValidationOutcome {
  const decisionMs = Date.parse(snap.tsUtc);
  const ageMs = Date.now() - decisionMs;
  const move = price - snap.spot;

  let mfe = prev.mfe ?? 0;
  let mae = prev.mae ?? 0;
  const hypoSide: "buy" | "sell" | null =
    snap.decision.includes("SELL") || snap.direction === "sell"
      ? "sell"
      : snap.decision.includes("BUY") || snap.direction === "buy"
        ? "buy"
        : snap.nextSellTrigger != null && snap.nextBuyTrigger == null
          ? "sell"
          : snap.nextBuyTrigger != null
            ? "buy"
            : snap.personalityBias === "bear"
              ? "sell"
              : snap.personalityBias === "bull"
                ? "buy"
                : null;

  if (snap.decision === "WAIT") {
    if (hypoSide === "sell") {
      mfe = Math.max(mfe, -move);
      mae = Math.max(mae, move);
    } else if (hypoSide === "buy") {
      mfe = Math.max(mfe, move);
      mae = Math.max(mae, -move);
    } else {
      // No directional hypo — track absolute excursion both ways but do not miss-flag
      mfe = Math.max(mfe, Math.abs(move));
      mae = Math.max(mae, 0);
    }
  } else if (snap.direction === "buy") {
    mfe = Math.max(mfe, price - snap.spot);
    mae = Math.max(mae, snap.spot - price);
  } else if (snap.direction === "sell") {
    mfe = Math.max(mfe, snap.spot - price);
    mae = Math.max(mae, price - snap.spot);
  }

  const hit = MISS_LADDERS.filter((t) => mfe >= t);
  let timeTo10Ms = prev.timeTo10Ms;
  let timeTo15Ms = prev.timeTo15Ms;
  let timeTo20Ms = prev.timeTo20Ms;
  let timeTo25Ms = prev.timeTo25Ms;
  if (mfe >= 10 && timeTo10Ms == null) timeTo10Ms = ageMs;
  if (mfe >= 15 && timeTo15Ms == null) timeTo15Ms = ageMs;
  if (mfe >= 20 && timeTo20Ms == null) timeTo20Ms = ageMs;
  if (mfe >= 25 && timeTo25Ms == null) timeTo25Ms = ageMs;

  const trigger =
    hypoSide === "sell" ? snap.nextSellTrigger : hypoSide === "buy" ? snap.nextBuyTrigger : null;
  let entryTriggerReached = prev.entryTriggerReached;
  if (trigger != null) {
    if (hypoSide === "buy" && price <= trigger + 0.5) entryTriggerReached = true;
    if (hypoSide === "sell" && price >= trigger - 0.5) entryTriggerReached = true;
    // Also: price traded through trigger in favorable direction
    if (hypoSide === "buy" && price >= trigger && snap.spot <= trigger) entryTriggerReached = true;
    if (hypoSide === "sell" && price <= trigger && snap.spot >= trigger) entryTriggerReached = true;
  }

  const validSetupExisted = validExecutableSetup(snap);
  const moveBeforeConfirmation =
    snap.decision === "WAIT" && mfe >= 15 && !snap.hadConfirmedPathBlocked
      ? true
      : snap.decision === "WAIT" && mfe >= 15 && snap.hadEarlySetupEvidence && !entryTriggerReached
        ? true
        : prev.moveBeforeConfirmation;

  const tradableAfterConfirmation =
    snap.decision === "WAIT" && entryTriggerReached && mfe >= 10
      ? Math.abs(price - (trigger ?? snap.spot)) <= 8
      : prev.tradableAfterConfirmation;

  // Strict miss: price move alone is NOT enough
  let missed: boolean | null = prev.missed;
  let missReason: string | null = prev.missReason;
  if (snap.decision === "WAIT") {
    if (mfe >= 15 && validSetupExisted && entryTriggerReached) {
      missed = true;
      missReason =
        moveBeforeConfirmation
          ? "Valid Early/Confirmed path existed; move reached trigger — confirmation arrived late or AI stayed WAIT."
          : "Valid executable setup existed and trigger was reached; favorable move ≥15 pts.";
    } else if (mfe >= 15 && !validSetupExisted) {
      missed = false;
      missReason =
        "Price moved ≥15 pts but no valid executable Early/Confirmed setup existed — not counted as missed opportunity.";
    } else if (mfe >= 15 && validSetupExisted && !entryTriggerReached) {
      missed = false;
      missReason =
        "Favorable move occurred but required entry trigger was never reached — not a tradable miss.";
    } else if (ageMs > 90 * 60_000 && missed == null) {
      missed = false;
      missReason = "Window closed without tradable miss criteria.";
    }
  }

  return {
    movePts: Math.round(move * 100) / 100,
    mfe: Math.round(mfe * 100) / 100,
    mae: Math.round(mae * 100) / 100,
    thresholdsHit: hit,
    timeTo10Ms,
    timeTo15Ms,
    timeTo20Ms,
    timeTo25Ms,
    entryTriggerReached,
    moveBeforeConfirmation,
    tradableAfterConfirmation,
    validSetupExisted,
    missed,
    missReason,
  };
}

export const useLiveValidation = create<ValidationState>()(
  persist(
    (set, get) => ({
      enabled: false,
      events: [],

      setEnabled: (on) => set({ enabled: on }),

      logDecision: (opts) => {
        if (!get().enabled) return;
        if (!(opts.price > 0)) return;
        const kind = opts.decision.kind;
        const id = `${dayPrefix()}:${opts.symbolId}:${opts.timeframe}:${kind}:${Math.floor(Date.now() / 15_000)}`;
        if (get().events.some((e) => e.id === id)) return;

        const oc =
          opts.optionChain ??
          useOptionChainFreeze.getState().getFrozen(opts.symbolCode) ??
          useOptionChainFreeze.getState().getFrozen(
            opts.symbolCode.replace(/[^A-Za-z]/g, "").toUpperCase(),
          );

        const snapshot = freezeDecisionState({
          ...opts,
          optionChain: oc,
        });

        // Ensure outcome never aliases into snapshot
        const ev: ValidationEvent = {
          id,
          snapshot: JSON.parse(JSON.stringify(snapshot)) as DecisionStateSnapshot,
          outcome: emptyOutcome(),
        };
        ev.outcome.validSetupExisted = validExecutableSetup(ev.snapshot);
        set((s) => ({ events: [ev, ...s.events].slice(0, 2000) }));
      },

      tickPrice: (symbolId, timeframe, price) => {
        if (!get().enabled || !(price > 0)) return;
        set((s) => ({
          events: s.events.map((e) => {
            if (e.snapshot.symbolId !== symbolId || e.snapshot.timeframe !== timeframe) return e;
            // CRITICAL: never mutate e.snapshot — only outcome
            const outcome = updateOutcome(e.snapshot, e.outcome, price);
            return { ...e, outcome };
          }),
        }));
      },

      clearDay: () =>
        set((s) => ({
          events: s.events.filter(
            (e) => !e.snapshot.tsUtc.startsWith(dayPrefix()) && !e.id.startsWith(dayPrefix()),
          ),
        })),
    }),
    { name: "trademind.liveValidation.v2" },
  ),
);
