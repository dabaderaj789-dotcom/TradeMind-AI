import { useActiveSetups } from "../../hooks/queries";
import { useRecommendation } from "../../hooks/useRecommendation";
import { directionTone, fmtNum, fmtPct, riskRating, titleCase } from "../../lib/format";
import { Badge, Card, EmptyState, Skeleton, Stat } from "../common/primitives";
import { Why } from "./Why";

export function StrategyCard({ id, tf }: { id: string; tf: string }) {
  const setups = useActiveSetups(id, tf);
  const top = setups.data?.items?.[0] ?? null;
  const { strategy, detail, isLoading } = useRecommendation(id, tf, top);
  const plan = detail?.recent_plans?.[0] ?? null;
  const tone = directionTone(plan?.direction ?? top?.direction);
  const planStatus = plan ? "Active plan" : strategy ? "Awaiting plan" : "No match";
  const risk = riskRating(plan?.risk_reward);

  return (
    <Card
      title="Strategy"
      actions={
        strategy && (
          <Why
            title="Strategy Evaluation"
            summary={strategy.strategy_name}
            reasoning={
              plan?.reasoning ??
              strategy.description ??
              "The strategy engine matches the active setup type against registered strategies and generates a structured trade plan when entry criteria are met."
            }
            confidence={plan ? { score: plan.strategy_confidence } : undefined}
            contributions={
              plan
                ? [
                    { label: "Direction", value: titleCase(plan.direction) },
                    { label: "Risk / Reward", value: fmtNum(plan.risk_reward) },
                    { label: "Position risk", value: fmtPct(plan.position_risk_pct) },
                  ]
                : undefined
            }
            raw={detail}
          />
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-20" />
      ) : !strategy ? (
        <EmptyState>No strategy matches the current setup.</EmptyState>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-content truncate">{strategy.strategy_name}</div>
              <div className="text-[11px] text-faint">v{strategy.strategy_version}</div>
            </div>
            <Badge tone={plan ? "bull" : "warn"}>{planStatus}</Badge>
          </div>

          {plan ? (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Direction" value={titleCase(plan.direction)} tone={tone} />
              <Stat label="R:R" value={fmtNum(plan.risk_reward)} tone={risk.tone} />
              <Stat label="Confidence" value={fmtPct(plan.strategy_confidence, 0)} tone="brand" />
            </div>
          ) : (
            <p className="text-xs text-faint">
              Matched <span className="text-muted">{strategy.strategy_name}</span>. No trade plan generated for this
              symbol / timeframe yet.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
