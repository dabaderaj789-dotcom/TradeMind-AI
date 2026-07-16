import { directionTone, fmtPct, fmtPrice, titleCase } from "../lib/format";
import type { Fvg } from "../lib/types";
import { Badge, Card, EmptyState } from "./ui";

export default function FvgPanel({ gaps, loading }: { gaps: Fvg[]; loading: boolean }) {
  return (
    <Card title="Fair Value Gaps" actions={<span className="text-xs text-slate-500">{gaps.length} active</span>}>
      {loading && gaps.length === 0 ? (
        <EmptyState>Loading fair value gaps…</EmptyState>
      ) : gaps.length === 0 ? (
        <EmptyState>No active fair value gaps.</EmptyState>
      ) : (
        <ul className="space-y-2 overflow-auto max-h-72 pr-1">
          {gaps.slice(0, 12).map((g) => {
            const tone = directionTone(g.type);
            return (
              <li key={g.fvg_id} className="rounded-lg bg-base-850 border border-base-800 p-3">
                <div className="flex items-center justify-between">
                  <Badge tone={tone}>{titleCase(g.type)}</Badge>
                  <span className="text-xs font-mono text-slate-400">{fmtPct(g.confidence)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-200">
                    {fmtPrice(g.gap_low)} – {fmtPrice(g.gap_high)}
                  </span>
                  <span className="text-slate-500">{titleCase(g.fill_state)} · {fmtPct(g.fill_percentage, 0)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
