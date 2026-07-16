import { useActiveSetups, useTrend } from "../../hooks/queries";
import { confidenceLabel, directionTone, fmtNum, fmtPrice, riskRating, titleCase } from "../../lib/format";
import { Badge, Card, ConfidenceRing, EmptyState, Skeleton, Stat } from "../common/primitives";
import { Why } from "./Why";

export function TradeSetupCard({ id, tf }: { id: string; tf: string }) {
  const { data, isLoading } = useActiveSetups(id, tf);
  const trend = useTrend(id, tf);
  const setup = data?.items?.[0] ?? null;
  const tone = directionTone(setup?.direction);
  const quality = setup ? confidenceLabel(setup.confidence_score) : null;
  const risk = riskRating(setup?.risk_reward);
  const evidence = Object.entries(setup?.evidence_scores ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <Card
      title="Trade Setup"
      subtitle="Decision support · no order execution"
      actions={
        setup && (
          <Why
            title="Trade Setup"
            summary={`${titleCase(setup.setup_type)} · ${tf}`}
            reasoning={setup.explanation}
            confidence={{ score: setup.confidence_score, note: `Rated "${quality?.label}" quality.` }}
            evidence={setup.evidence_scores}
            contributions={[
              { label: "Direction", value: titleCase(setup.direction) },
              { label: "Risk / Reward", value: setup.risk_reward != null ? fmtNum(setup.risk_reward) : "—" },
              { label: "Status", value: titleCase(setup.status) },
            ]}
            raw={setup}
          />
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !setup ? (
        <EmptyState>No active setup on this timeframe.</EmptyState>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge tone={tone}>{tone === "bull" ? "Long" : tone === "bear" ? "Short" : "Neutral"}</Badge>
                <span className="text-sm font-semibold text-content">{titleCase(setup.setup_type)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {quality && <Badge tone={quality.tone}>{quality.label} quality</Badge>}
                <Badge tone={risk.tone}>Risk: {risk.label}</Badge>
                {trend.data && <Badge tone="neutral">{titleCase(trend.data.market_phase)}</Badge>}
              </div>
            </div>
            <ConfidenceRing value={setup.confidence_score} size={68} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Entry" value={fmtPrice(setup.entry_zone.low)} />
            <Stat label="Stop" value={fmtPrice(setup.stop_loss_zone.low)} tone="bear" />
            <Stat label="R:R" value={setup.risk_reward != null ? fmtNum(setup.risk_reward) : "—"} tone="brand" />
          </div>

          {evidence.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint mb-1.5">Supporting evidence</div>
              <div className="flex flex-wrap gap-1.5">
                {evidence.map(([k, v]) => (
                  <span key={k} className="pill bg-elevated text-muted">
                    {titleCase(k)} · <span className="font-mono text-content ml-1">{v.toFixed(0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
