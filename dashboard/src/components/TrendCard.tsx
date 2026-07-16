import { directionTone, fmtPct, fmtTime, titleCase } from "../lib/format";
import type { Trend } from "../lib/types";
import { Badge, Card, EmptyState, ProgressBar } from "./ui";

export default function TrendCard({ trend, loading }: { trend: Trend | null; loading: boolean }) {
  const tone = directionTone(trend?.trend);
  const arrow = tone === "bull" ? "↑" : tone === "bear" ? "↓" : "→";

  return (
    <Card title="Current Trend">
      {loading && !trend ? (
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-32 bg-base-800 rounded" />
          <div className="h-2 w-full bg-base-800 rounded" />
        </div>
      ) : !trend ? (
        <EmptyState>No market-structure data yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className={`text-2xl font-semibold ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-300"}`}>
              <span className="mr-1">{arrow}</span>
              {titleCase(trend.trend)}
            </div>
            <Badge tone={tone}>{titleCase(trend.market_phase)}</Badge>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Trend confidence</span>
              <span className="font-mono text-slate-300">{fmtPct(trend.confidence)}</span>
            </div>
            <ProgressBar value={trend.confidence} tone={tone === "neutral" ? "brand" : tone} />
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Phase confidence</span>
              <span className="font-mono text-slate-300">{fmtPct(trend.phase_confidence)}</span>
            </div>
            <ProgressBar value={trend.phase_confidence} tone="brand" />
          </div>

          <p className="text-xs text-slate-600">As of {fmtTime(trend.as_of)}</p>
        </div>
      )}
    </Card>
  );
}
