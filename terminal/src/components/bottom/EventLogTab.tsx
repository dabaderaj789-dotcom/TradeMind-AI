import { useMemo } from "react";
import { useActiveSetups, useStructureEvents, useSweeps } from "../../hooks/queries";
import { fmtTime } from "../../lib/format";
import { buildTimeline } from "../../lib/timeline";
import { Badge, EmptyState, Spinner } from "../common/primitives";

export function EventLogTab({ id, tf }: { id: string; tf: string }) {
  const events = useStructureEvents(id, tf);
  const setups = useActiveSetups(id, tf);
  const sweeps = useSweeps(id, tf);

  const timeline = useMemo(
    () => buildTimeline(events.data, setups.data?.items ?? [], sweeps.data?.items ?? []),
    [events.data, setups.data, sweeps.data],
  );

  const loading = events.isLoading || setups.isLoading || sweeps.isLoading;
  if (loading) return <Spinner label="Building event log…" />;
  if (timeline.length === 0) return <EmptyState>No events recorded for this symbol / timeframe.</EmptyState>;

  return (
    <div className="h-full overflow-auto p-3">
      <ol className="relative border-l border-subtle/60 ml-3 space-y-3">
        {timeline.map((e) => (
          <li key={e.id} className="ml-4">
            <span
              className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${
                e.tone === "bull"
                  ? "bg-bull"
                  : e.tone === "bear"
                    ? "bg-bear"
                    : e.tone === "warn"
                      ? "bg-warn"
                      : "bg-info"
              }`}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Badge tone={e.tone}>{e.kind}</Badge>
                <span className="text-sm text-content truncate">{e.label}</span>
                <span className="text-xs text-faint truncate hidden sm:inline">{e.detail}</span>
              </div>
              <span className="text-xs text-faint whitespace-nowrap">{fmtTime(e.at)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
