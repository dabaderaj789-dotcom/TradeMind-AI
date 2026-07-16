import { useMemo } from "react";
import { useAnalysis, useStructureEvents } from "../../hooks/queries";
import { fmtPrice, fmtTime, titleCase } from "../../lib/format";
import type { AnalysisBar } from "../../lib/types";
import { Badge, Card, EmptyState, Skeleton } from "../common/primitives";
import { Why } from "./Why";

const SWING_TONE: Record<string, "bull" | "bear" | "neutral"> = {
  HH: "bull",
  HL: "bull",
  LH: "bear",
  LL: "bear",
};

export function MarketStructureCard({ id, tf }: { id: string; tf: string }) {
  const events = useStructureEvents(id, tf);
  const ms = useAnalysis(id, tf, "market_structure", true);

  const swings = useMemo(() => {
    const bars = (ms.data?.items ?? []) as AnalysisBar[];
    const labels: { label: string; at: string }[] = [];
    for (let i = bars.length - 1; i >= 0 && labels.length < 4; i--) {
      const t = bars[i].values["swing_type"];
      if (typeof t === "string" && t) labels.push({ label: t, at: bars[i].open_time });
    }
    return labels.reverse();
  }, [ms.data]);

  const recent = useMemo(() => {
    const bos = (events.data?.bos_events ?? []).map((e) => ({ ...e, kind: "BOS" as const }));
    const choch = (events.data?.choch_events ?? []).map((e) => ({ ...e, kind: "CHoCH" as const }));
    return [...bos, ...choch]
      .sort((a, b) => new Date(b.break_time).getTime() - new Date(a.break_time).getTime())
      .slice(0, 4);
  }, [events.data]);

  const loading = events.isLoading || ms.isLoading;
  const empty = swings.length === 0 && recent.length === 0;

  return (
    <Card
      title="Market Structure"
      actions={
        !empty && (
          <Why
            title="Market Structure"
            summary={`${tf} structure map`}
            reasoning="Swing points are classified as Higher-High (HH), Higher-Low (HL), Lower-High (LH) or Lower-Low (LL). A Break of Structure (BOS) confirms trend continuation; a Change of Character (CHoCH) signals a potential reversal."
            contributions={recent.map((e) => ({
              label: `${e.kind} · ${titleCase(e.event_type)}`,
              value: fmtPrice(e.break_price),
            }))}
            raw={{ swings, events: recent }}
          />
        )
      }
    >
      {loading ? (
        <Skeleton className="h-20" />
      ) : empty ? (
        <EmptyState>No structure signals yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {swings.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint mb-1.5">Swing sequence</div>
              <div className="flex items-center gap-1.5">
                {swings.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Badge tone={SWING_TONE[s.label] ?? "neutral"}>{s.label}</Badge>
                    {i < swings.length - 1 && <span className="text-faint">→</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint mb-1.5">Recent breaks</div>
              <ul className="space-y-1.5">
                {recent.map((e, i) => {
                  const up = e.break_price >= e.broken_swing_price;
                  return (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <Badge tone={e.kind === "CHoCH" ? "warn" : "info"}>{e.kind}</Badge>
                        <span className={up ? "text-bull" : "text-bear"}>{titleCase(e.event_type)}</span>
                      </span>
                      <span className="flex items-center gap-3 font-mono text-faint">
                        <span className="text-muted">{fmtPrice(e.break_price)}</span>
                        {fmtTime(e.break_time)}
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
