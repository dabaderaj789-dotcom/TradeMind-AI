import { fmtPrice, fmtTime, titleCase } from "../lib/format";
import type { Levels, StructureEvents } from "../lib/types";
import { Badge, Card, EmptyState } from "./ui";

export default function MarketStructurePanel({
  levels,
  events,
  loading,
}: {
  levels: Levels | null;
  events: StructureEvents | null;
  loading: boolean;
}) {
  const recentEvents = [
    ...(events?.bos_events ?? []).map((e) => ({ ...e, kind: "BOS" as const })),
    ...(events?.choch_events ?? []).map((e) => ({ ...e, kind: "CHoCH" as const })),
  ]
    .sort((a, b) => new Date(b.break_time).getTime() - new Date(a.break_time).getTime())
    .slice(0, 6);

  const supports = levels?.support_levels?.slice(0, 4) ?? [];
  const resistances = levels?.resistance_levels?.slice(0, 4) ?? [];
  const hasLevels = supports.length > 0 || resistances.length > 0;

  return (
    <Card title="Market Structure">
      {loading && !levels && !events ? (
        <EmptyState>Loading structure…</EmptyState>
      ) : !hasLevels && recentEvents.length === 0 ? (
        <EmptyState>No structure levels or breaks detected yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <LevelColumn title="Resistance" tone="bear" levels={resistances} />
            <LevelColumn title="Support" tone="bull" levels={supports} />
          </div>

          {recentEvents.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Recent breaks</div>
              <ul className="space-y-1.5">
                {recentEvents.map((e, i) => {
                  const isBullish = e.break_price >= e.broken_swing_price;
                  return (
                    <li key={`${e.kind}-${i}`} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <Badge tone={e.kind === "CHoCH" ? "warn" : "brand"}>{e.kind}</Badge>
                        <span className={isBullish ? "text-bull" : "text-bear"}>
                          {titleCase(e.event_type)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 font-mono text-slate-400">
                        <span>{fmtPrice(e.break_price)}</span>
                        <span className="text-slate-600">{fmtTime(e.break_time)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function LevelColumn({
  title,
  tone,
  levels,
}: {
  title: string;
  tone: "bull" | "bear";
  levels: { price: number; touches: number }[];
}) {
  return (
    <div>
      <div className={`text-[11px] uppercase tracking-wide mb-2 ${tone === "bull" ? "text-bull" : "text-bear"}`}>
        {title}
      </div>
      {levels.length === 0 ? (
        <div className="text-xs text-slate-600">—</div>
      ) : (
        <ul className="space-y-1">
          {levels.map((l, i) => (
            <li key={i} className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-200">{fmtPrice(l.price)}</span>
              <span className="text-slate-600">{l.touches}×</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
