/**
 * Chart clarity helpers — only surface the most relevant Smart Money / plan objects.
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

export const MIN_CHART_SMC_CONFIDENCE = 70;

export { smcConfidencePct };

function isActiveOrderBlock(o: OrderBlock): boolean {
  const status = o.status.toLowerCase();
  const mit = o.mitigation_state.toLowerCase();
  // Engines label live zones as fresh/active with untouched/unmitigated mitigation.
  const statusOk = status === "active" || status === "fresh" || status === "valid";
  const mitOk = mit.includes("untouched") || mit.includes("unmitigated");
  return statusOk && mitOk && smcConfidencePct(o.confidence) >= MIN_CHART_SMC_CONFIDENCE;
}

export function selectActiveOrderBlocks(items: OrderBlock[] | undefined, showHistorical = false): OrderBlock[] {
  const active = [...(items ?? [])]
    .filter(isActiveOrderBlock)
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  if (showHistorical) return active.slice(0, 3);
  return active.slice(0, 1);
}

export function selectFreshFvgs(items: Fvg[] | undefined, showHistorical = false): Fvg[] {
  const fresh = [...(items ?? [])]
    .filter(
      (g) =>
        g.status.toLowerCase() === "open" &&
        g.fill_percentage < 50 &&
        smcConfidencePct(g.confidence) >= MIN_CHART_SMC_CONFIDENCE,
    )
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  if (showHistorical) return fresh.slice(0, 3);
  return fresh.slice(0, 1);
}

export function selectCurrentSweeps(items: LiquiditySweep[] | undefined, showHistorical = false): LiquiditySweep[] {
  const list = [...(items ?? [])]
    .filter((s) => smcConfidencePct(s.confidence) >= MIN_CHART_SMC_CONFIDENCE)
    .sort((a, b) => smcConfidencePct(b.confidence) - smcConfidencePct(a.confidence));
  if (showHistorical) return list.slice(0, 2);
  return list.slice(0, 1);
}

export function selectCurrentStructure(events: StructureEvents | null | undefined, showHistorical = false) {
  if (!events) return { bos_events: [], choch_events: [] };
  if (showHistorical) {
    return {
      bos_events: (events.bos_events ?? []).slice(0, 3),
      choch_events: (events.choch_events ?? []).slice(0, 3),
    };
  }
  return {
    bos_events: (events.bos_events ?? []).slice(0, 1),
    choch_events: (events.choch_events ?? []).slice(0, 1),
  };
}

/** Collapse markers that share a bar: keep ≤3, prefer BOS/CHoCH/AI over noise. */
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
  // Prefer a single actionable marker; hide WAIT on chart for clarity.
  const actionable = list.filter((a) => a.side === "buy" || a.side === "sell");
  if (actionable.length) return actionable.slice(-1);
  return [];
}

/** Only draw a trade plan when BUY/SELL is actionable (predictive plan exists). WAIT → none. */
export function selectTradePlan(
  predictive: PredictivePlan | null | undefined,
  _setups?: TradeSetup[] | undefined,
): { predictive: PredictivePlan | null; setup: TradeSetup | null } {
  if (predictive) return { predictive, setup: null };
  return { predictive: null, setup: null };
}

/** Nearest support (below last) / resistance (above last) — one each. */
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
  const supports = [...(levels?.support_levels ?? [])]
    .map((l) => Number(l.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  const resistances = [...(levels?.resistance_levels ?? [])]
    .map((l) => Number(l.price))
    .filter((p) => Number.isFinite(p) && p > 0);

  const px = lastPrice != null && Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : null;

  let support: number | null = null;
  let resistance: number | null = null;

  if (px != null) {
    const below = supports.filter((p) => p <= px).sort((a, b) => b - a);
    const above = resistances.filter((p) => p >= px).sort((a, b) => a - b);
    support = below[0] ?? supports.sort((a, b) => b - a)[0] ?? null;
    resistance = above[0] ?? resistances.sort((a, b) => a - b)[0] ?? null;
  } else {
    support = supports.sort((a, b) => b - a)[0] ?? null;
    resistance = resistances.sort((a, b) => a - b)[0] ?? null;
  }

  return { support, resistance };
}
