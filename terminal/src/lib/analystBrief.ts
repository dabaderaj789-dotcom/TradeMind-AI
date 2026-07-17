/**
 * Assembles a professional analyst brief from existing engine outputs.
 * No new trading logic — presentation only.
 */

import type { AiDecision } from "./decision";
import {
  selectActiveOrderBlocks,
  selectCurrentStructure,
  selectCurrentSweeps,
  selectFreshFvgs,
  selectNearestLevels,
} from "./chartQuality";
import { num, titleCase } from "./format";
import type { PredictivePlan } from "./predictiveSignal";
import type {
  Fvg,
  Levels,
  LiquiditySweep,
  OrderBlock,
  StructureEvents,
  Trend,
} from "./types";

export interface AnalystBrief {
  trend: string;
  structure: string;
  nearestSupport: number | null;
  nearestResistance: number | null;
  nearestOb: { label: string; high: number; low: number; confidence: number } | null;
  nearestFvg: { label: string; high: number; low: number; confidence: number } | null;
  liquidityStatus: string;
  marketPhase: string;
  whyWait: string | null;
  unlockBeforeBuy: string[];
  expectedRr: number | null;
  institutionalScore: number;
  institutionalGrade: string;
  bosLabel: string | null;
  chochLabel: string | null;
  swingSequence: string[];
}

export function buildAnalystBrief(opts: {
  decision: AiDecision | null;
  predictive: PredictivePlan | null;
  trend: Trend | null | undefined;
  levels: Levels | null | undefined;
  events: StructureEvents | null | undefined;
  orderBlocks: OrderBlock[] | undefined;
  fvgs: Fvg[] | undefined;
  sweeps: LiquiditySweep[] | undefined;
  swings: { type: string }[];
  lastPrice?: number | null;
}): AnalystBrief {
  const {
    decision,
    predictive,
    trend,
    levels,
    events,
    orderBlocks,
    fvgs,
    sweeps,
    swings,
    lastPrice,
  } = opts;

  const { support, resistance } = selectNearestLevels(levels, lastPrice ?? null);
  const ob = selectActiveOrderBlocks(orderBlocks)[0] ?? null;
  const fvg = selectFreshFvgs(fvgs)[0] ?? null;
  const sweep = selectCurrentSweeps(sweeps)[0] ?? null;
  const structure = selectCurrentStructure(events);
  const bos = structure.bos_events[0];
  const choch = structure.choch_events[0];

  const trendLabel = trend
    ? `${titleCase(trend.trend)} (${Math.round(trend.confidence)}%)`
    : decision?.trendLabel
      ? titleCase(decision.trendLabel)
      : "—";

  const swingSeq = swings.map((s) => s.type).slice(0, 6);
  const structureParts: string[] = [];
  if (swingSeq.length) structureParts.push(swingSeq.join(" → "));
  if (bos) structureParts.push(`BOS ${titleCase(bos.event_type.replace(/_/g, " "))}`);
  if (choch) structureParts.push(`CHoCH ${titleCase(choch.event_type.replace(/_/g, " "))}`);
  const structureLabel = structureParts.length ? structureParts.join(" · ") : "No clear structure yet";

  let liquidityStatus = decision?.marketHealth.liquidity
    ? titleCase(decision.marketHealth.liquidity)
    : "Unknown";
  if (sweep) {
    liquidityStatus = `${titleCase(sweep.type.replace(/_/g, " "))} @ ${num(sweep.sweep_level).toFixed(2)} (${Math.round(sweep.confidence)}%)`;
  } else if ((sweeps?.length ?? 0) === 0) {
    liquidityStatus = `${liquidityStatus} · no recent sweep`;
  }

  const phase =
    decision?.marketHealth.phase ??
    (trend ? titleCase(trend.market_phase) : "—");

  const waiting = !decision?.actionable;
  const whyWait = waiting
    ? decision?.rejectionReasons?.length
      ? decision.rejectionReasons.slice(0, 4).join("; ")
      : decision?.reasoning ?? "Standing aside — checklist not cleared."
    : null;

  const unlockBeforeBuy = waiting ? (decision?.unlockConditions ?? []).slice(0, 5) : [];

  const expectedRr =
    predictive?.riskReward ??
    decision?.signalQuality.riskReward ??
    null;

  return {
    trend: trendLabel,
    structure: structureLabel,
    nearestSupport: support,
    nearestResistance: resistance,
    nearestOb: ob
      ? {
          label: titleCase(ob.type.replace(/_/g, " ")),
          high: num(ob.zone_high),
          low: num(ob.zone_low),
          confidence: ob.confidence,
        }
      : null,
    nearestFvg: fvg
      ? {
          label: titleCase(fvg.type.replace(/_/g, " ")),
          high: num(fvg.gap_high),
          low: num(fvg.gap_low),
          confidence: fvg.confidence,
        }
      : null,
    liquidityStatus,
    marketPhase: phase,
    whyWait,
    unlockBeforeBuy,
    expectedRr,
    institutionalScore: decision?.institutional.score ?? 0,
    institutionalGrade: decision?.institutional.grade ?? "—",
    bosLabel: bos ? titleCase(bos.event_type.replace(/_/g, " ")) : null,
    chochLabel: choch ? titleCase(choch.event_type.replace(/_/g, " ")) : null,
    swingSequence: swingSeq,
  };
}
