import { directionTone, fmtPct, fmtPrice, titleCase } from "../lib/format";
import type { LiquiditySweep } from "../lib/types";
import { Badge, Card, EmptyState } from "./ui";

export default function LiquiditySweepPanel({
  sweeps,
  loading,
}: {
  sweeps: LiquiditySweep[];
  loading: boolean;
}) {
  return (
    <Card title="Liquidity Sweeps" actions={<span className="text-xs text-slate-500">{sweeps.length} active</span>}>
      {loading && sweeps.length === 0 ? (
        <EmptyState>Loading liquidity sweeps…</EmptyState>
      ) : sweeps.length === 0 ? (
        <EmptyState>No active liquidity sweeps.</EmptyState>
      ) : (
        <ul className="space-y-2 overflow-auto max-h-72 pr-1">
          {sweeps.slice(0, 12).map((s) => {
            const tone = directionTone(s.type);
            return (
              <li key={s.sweep_id} className="rounded-lg bg-base-850 border border-base-800 p-3">
                <div className="flex items-center justify-between">
                  <Badge tone={tone}>{titleCase(s.type)}</Badge>
                  <span className="text-xs font-mono text-slate-400">{fmtPct(s.confidence)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-200">{fmtPrice(s.sweep_level)}</span>
                  <span className="text-slate-500">{titleCase(s.level_type)} · {titleCase(s.status)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
