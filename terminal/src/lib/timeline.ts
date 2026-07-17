import { directionTone, fmtPrice, titleCase } from "./format";
import type { LiquiditySweep, StructureEvents, TimelineEvent, TradeSetup } from "./types";

export function buildTimeline(
  events: StructureEvents | undefined,
  setups: TradeSetup[],
  sweeps: LiquiditySweep[],
): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  for (const e of events?.bos_events ?? []) {
    const tone = e.break_price >= e.broken_swing_price ? "bull" : "bear";
    out.push({
      id: `bos-${e.break_time}-${e.break_price}`,
      kind: "BOS",
      label: "Break of Structure",
      detail: `${titleCase(e.event_type)} @ ${fmtPrice(e.break_price)}`,
      tone,
      at: e.break_time,
    });
  }
  for (const e of events?.choch_events ?? []) {
    const tone = e.break_price >= e.broken_swing_price ? "bull" : "bear";
    out.push({
      id: `choch-${e.break_time}-${e.break_price}`,
      kind: "CHoCH",
      label: "Change of Character",
      detail: `${titleCase(e.event_type)} @ ${fmtPrice(e.break_price)}`,
      tone: tone === "bull" ? "warn" : "warn",
      at: e.break_time,
    });
  }
  for (const s of setups) {
    out.push({
      id: `setup-${s.setup_id}`,
      kind: "Setup",
      label: titleCase(s.setup_type),
      detail: `${titleCase(s.direction)} · ${s.confidence_score.toFixed(0)}% confidence`,
      tone: directionTone(s.direction),
      at: s.detected_at,
    });
  }
  for (const s of sweeps) {
    out.push({
      id: `sweep-${s.sweep_id}`,
      kind: "Sweep",
      label: "Liquidity Sweep",
      detail: `${titleCase(s.type)} @ ${fmtPrice(s.sweep_level)} · ${titleCase(s.status)}`,
      tone: "info",
      at: s.confirmed_at ?? s.created_at,
    });
  }

  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
