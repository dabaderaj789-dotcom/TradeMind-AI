import { directionTone, fmtPct, fmtPrice, titleCase } from "../lib/format";
import type { OrderBlock } from "../lib/types";
import { Badge, Card, EmptyState } from "./ui";

export default function OrderBlockPanel({ blocks, loading }: { blocks: OrderBlock[]; loading: boolean }) {
  return (
    <Card title="Order Blocks" actions={<Count n={blocks.length} />}>
      {loading && blocks.length === 0 ? (
        <EmptyState>Loading order blocks…</EmptyState>
      ) : blocks.length === 0 ? (
        <EmptyState>No active order blocks.</EmptyState>
      ) : (
        <ul className="space-y-2 overflow-auto max-h-72 pr-1">
          {blocks.slice(0, 12).map((ob) => {
            const tone = directionTone(ob.type);
            return (
              <li key={ob.order_block_id} className="rounded-lg bg-base-850 border border-base-800 p-3">
                <div className="flex items-center justify-between">
                  <Badge tone={tone}>{titleCase(ob.type)}</Badge>
                  <span className="text-xs font-mono text-slate-400">{fmtPct(ob.confidence)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-200">
                    {fmtPrice(ob.zone_low)} – {fmtPrice(ob.zone_high)}
                  </span>
                  <span className="text-slate-500">{titleCase(ob.mitigation_state)} · {ob.touch_count}×</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-xs text-slate-500">{n} active</span>;
}
