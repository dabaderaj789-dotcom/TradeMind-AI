/**
 * Chart clarity helpers — current + previous institutional context.
 * Fade older levels; keep until invalidated. Presentation only.
 */

import type {
  Fvg,
  LiquiditySweep,
  OrderBlock,
  StructureEvents,
  TradeSetup,
} from "./types";
import type { PredictivePlan } from "./predictiveSignal";
import type { ChartAnnotation } from "./decision";
import { smcConfidencePct } from "./format";

export const MIN_CHART_SMC_CONFIDENCE = 55;

export { smcConfidencePct };

function isActiveOrderBlock(o: OrderBlock): boolean {
  const status = o.status.toLowerCase();
  const mit = o.mitigation_state.toLowerCase();
  if (status.includes("invalid")) return false;
  const statusOk = status === "active" || status === "fresh" || status === "valid";
  const mitOk = mit.includes("untouched") || mit.includes("unmitigated") || mit.includes("partial");
  return statusOk && mitOk && smcConfidencePct(o.confidence) >= MIN_CHART_SMC_CONFIDENCE;
}

function isRetainedOrderBlock(o: OrderBlock): boolean {
  const status = o.status.toLowerCase();
  if (status.includes("invalid")) return false;
  return smcConfidencePct(o.confidence) >= Math.max(40, MIN_CHART_SMC_CONFIDENCE - 15);
}

function isOpenFvg(g: Fvg): boolean {
  return (
    g.status.toLowerCase() === "open" &&
    g.fill_percentage < 80 &&
    smcConfidencePct(g.confidence) >= MIN_CHART_SMC_CONFIDENCE
  );
}

function isRetainedFvg(g: Fvg): boolean {
  if (g.status.toLowerCase().includes("invalid") || g.status.toLowerCase().includes("full")) return false;
  return g.fill_percentage < 95 && smcConfidencePct(g.confidence) >= 40;
}

export function selectActiveOrderBlocks(items: OrderBlock[] | undefined, showHistorical = false): OrderBlock[] {
  const active = [...(items ?? [])]
    .filter(isActiveOrderBlock)
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  if (showHistorical) return active.slice(0, 3);
  return active.slice(0, 1);
}

/** Secondary OBs kept for context (faded) until invalidated. */
export function selectPreviousOrderBlocks(items: OrderBlock[] | undefined): OrderBlock[] {
  const all = [...(items ?? [])]
    .filter(isRetainedOrderBlock)
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  const activeIds = new Set(selectActiveOrderBlocks(items, false).map((o) => o.order_block_id));
  return all.filter((o) => !activeIds.has(o.order_block_id)).slice(0, 3);
}

export function selectFreshFvgs(items: Fvg[] | undefined, showHistorical = false): Fvg[] {
  const fresh = [...(items ?? [])]
    .filter(isOpenFvg)
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  if (showHistorical) return fresh.slice(0, 3);
  return fresh.slice(0, 1);
}

export function selectPreviousFvgs(items: Fvg[] | undefined): Fvg[] {
  const all = [...(items ?? [])]
    .filter(isRetainedFvg)
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  const freshIds = new Set(selectFreshFvgs(items, false).map((g) => g.fvg_id));
  return all.filter((g) => !freshIds.has(g.fvg_id)).slice(0, 3);
}

export function selectCurrentSweeps(items: LiquiditySweep[] | undefined, showHistorical = false): LiquiditySweep[] {
  const list = [...(items ?? [])]
    .filter((s) => {
      const st = s.status.toLowerCase();
      if (st.includes("invalid") || st.includes("fail")) return false;
      return smcConfidencePct(s.confidence) >= MIN_CHART_SMC_CONFIDENCE;
    })
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  if (showHistorical) return list.slice(0, 3);
  return list.slice(0, 2);
}

export function selectCurrentStructure(events: StructureEvents | null | undefined, showHistorical = false) {
  if (!events) return { bos_events: [], choch_events: [] };
  if (showHistorical) {
    return {
      bos_events: (events.bos_events ?? []).slice(0, 4),
      choch_events: (events.choch_events ?? []).slice(0, 4),
    };
  }
  return {
    bos_events: (events.bos_events ?? []).slice(0, 1),
    choch_events: (events.choch_events ?? []).slice(0, 1),
  };
}

/** Current + previous BOS/CHoCH (previous drawn faded). */
export function selectStructureLadder(events: StructureEvents | null | undefined) {
  const bos = events?.bos_events ?? [];
  const choch = events?.choch_events ?? [];
  return {
    bosCurrent: bos.slice(0, 1),
    bosPrevious: bos.slice(1, 3),
    chochCurrent: choch.slice(0, 1),
    chochPrevious: choch.slice(1, 3),
  };
}

export function declutterMarkers<T extends { time: unknown; text?: string; priority?: number }>(
  markers: T[],
  maxPerBar = 3,
): T[] {
  const byTime = new Map<string, T[]>();
  for (const m of markers) {
    const key = String(m.time);
    const list = byTime.get(key) ?? [];
    list.push(m);
    byTime.set(key, list);
  }
  const out: T[] = [];
  for (const [, list] of byTime) {
    if (list.length <= maxPerBar) {
      out.push(...list);
      continue;
    }
    const scored = [...list].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    out.push(...scored.slice(0, maxPerBar));
  }
  return out;
}

export function markerPriority(text: string): number {
  if (text.includes("STRONG") || text.includes("BUY") || text.includes("SELL")) return 50;
  if (text.includes("CHoCH")) return 40;
  if (text.includes("BOS")) return 35;
  if (text.includes("WAIT")) return 10;
  return 20;
}

export function selectAnnotations(anns: ChartAnnotation[] | undefined): ChartAnnotation[] {
  const list = anns ?? [];
  const actionable = list.filter((a) => a.side === "buy" || a.side === "sell");
  if (actionable.length) return actionable.slice(-1);
  return [];
}

export function selectTradePlan(
  predictive: PredictivePlan | null | undefined,
  _setups?: TradeSetup[] | undefined,
): { predictive: PredictivePlan | null; setup: TradeSetup | null } {
  if (predictive) return { predictive, setup: null };
  return { predictive: null, setup: null };
}

export interface LevelLadder {
  support: number | null;
  resistance: number | null;
  prevSupport: number | null;
  prevResistance: number | null;
}

/** Current + previous major S/R. */
export function selectLevelLadder(
  levels:
    | {
        support_levels?: { price: number | string }[];
        resistance_levels?: { price: number | string }[];
      }
    | null
    | undefined,
  lastPrice?: number | null,
): LevelLadder {
  const supports = [...(levels?.support_levels ?? [])]
    .map((l) => Number(l.price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => b - a);
  const resistances = [...(levels?.resistance_levels ?? [])]
    .map((l) => Number(l.price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  const px = lastPrice != null && Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : null;

  let support: number | null = null;
  let resistance: number | null = null;
  let prevSupport: number | null = null;
  let prevResistance: number | null = null;

  if (px != null) {
    const below = supports.filter((p) => p <= px);
    const above = resistances.filter((p) => p >= px);
    support = below[0] ?? null;
    prevSupport = below[1] ?? null;
    resistance = above[0] ?? null;
    prevResistance = above[1] ?? null;
  } else {
    support = supports[0] ?? null;
    prevSupport = supports[1] ?? null;
    resistance = resistances[0] ?? null;
    prevResistance = resistances[1] ?? null;
  }

  return { support, resistance, prevSupport, prevResistance };
}

/** @deprecated use selectLevelLadder */
export function selectNearestLevels(
  levels:
    | {
        support_levels?: { price: number | string }[];
        resistance_levels?: { price: number | string }[];
      }
    | null
    | undefined,
  lastPrice?: number | null,
) {
  const ladder = selectLevelLadder(levels, lastPrice);
  return { support: ladder.support, resistance: ladder.resistance };
}
