import { directionTone, fmtNum, fmtPct, fmtPrice, titleCase } from "../lib/format";
import type { StrategyDetail } from "../lib/types";
import { Badge, Card, EmptyState, Stat } from "./ui";

export default function StrategyRecommendationCard({
  detail,
  loading,
}: {
  detail: StrategyDetail | null;
  loading: boolean;
}) {
  const plan = detail?.recent_plans?.[0] ?? null;
  const tone = directionTone(plan?.direction);

  return (
    <Card title="Strategy Recommendation">
      {loading && !detail ? (
        <EmptyState>Evaluating strategies…</EmptyState>
      ) : !detail ? (
        <EmptyState>No strategy matched the current setup.</EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-100">{detail.strategy.strategy_name}</div>
              <div className="text-[11px] text-slate-500">v{detail.strategy.strategy_version}</div>
            </div>
            {plan && <Badge tone={tone}>{titleCase(plan.direction)}</Badge>}
          </div>

          {!plan ? (
            <>
              <p className="text-xs text-slate-500 leading-relaxed">{detail.strategy.description}</p>
              <p className="text-xs text-slate-600">
                No recent trade plan generated for this symbol / timeframe.
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Entry" value={fmtPrice(plan.entry_zone?.low ?? plan.entry_zone?.high)} />
                <Stat label="Stop" value={fmtPrice(plan.stop_loss)} tone="bear" />
                <Stat label="Target 1" value={fmtPrice(plan.target_1)} tone="bull" />
                <Stat label="R:R" value={fmtNum(plan.risk_reward)} tone="brand" />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Strategy confidence</span>
                <span className="font-mono text-slate-200">{fmtPct(plan.strategy_confidence)}</span>
              </div>

              {plan.reasoning && (
                <p className="text-xs text-slate-500 leading-relaxed border-t border-base-800 pt-3">
                  {plan.reasoning}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
