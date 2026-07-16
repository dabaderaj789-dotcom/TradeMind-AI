import { useTrend } from "../../hooks/queries";
import { directionTone, fmtTime, titleCase, trendLabel } from "../../lib/format";
import { Badge, Card, ConfidenceRing, ErrorState, Skeleton } from "../common/primitives";
import { Why } from "./Why";

export function TrendCard({ id, tf }: { id: string; tf: string }) {
  const { data, isLoading, error, refetch } = useTrend(id, tf);
  const tone = directionTone(data?.trend);
  const label = data ? trendLabel(data.trend, data.confidence) : "—";

  const reasoning = data
    ? `The ${tf} structure is currently ${label.toLowerCase()} with an overall confidence of ${data.confidence.toFixed(
        0,
      )}%. Price action is in a ${titleCase(data.market_phase).toLowerCase()} phase (${data.phase_confidence.toFixed(
        0,
      )}% phase confidence), derived from swing sequencing and break-of-structure analysis.`
    : undefined;

  return (
    <Card
      title="Trend"
      actions={
        data && (
          <Why
            title="Trend Analysis"
            summary={`${label} · ${tf}`}
            reasoning={reasoning}
            confidence={{ score: data.confidence, note: "Composite of swing direction, momentum and phase alignment." }}
            evidence={{ "Trend confidence": data.confidence, "Phase confidence": data.phase_confidence }}
            raw={data}
          />
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : error || !data ? (
        <ErrorState message="No trend data. Run analysis for this symbol/timeframe." onRetry={() => refetch()} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div
              className={`text-xl font-semibold ${
                tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-muted"
              }`}
            >
              {label}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone={tone}>{titleCase(data.market_phase)}</Badge>
              <span className="text-[11px] text-faint">{fmtTime(data.as_of)}</span>
            </div>
          </div>
          <ConfidenceRing value={data.confidence} size={64} />
        </div>
      )}
    </Card>
  );
}
