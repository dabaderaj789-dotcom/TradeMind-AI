import type { PredictivePlan } from "../../lib/predictiveSignal";
import { cx, fmtDistance, fmtNum, fmtPrice, fmtPct } from "../../lib/format";
import { Badge, ConfidenceRing, Skeleton } from "../common/primitives";
import { Why } from "./Why";

export function PredictiveSignalCard({
  plan,
  loading,
}: {
  plan: PredictivePlan | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <section className="card overflow-hidden">
        <div className="p-4">
          <Skeleton className="h-36" />
        </div>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="card p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint mb-1">Predictive Signal</div>
        <p className="text-sm text-muted">
          No actionable plan — TradeMind stays in WAIT until strategy rules and evidence clear the quality gates.
        </p>
      </section>
    );
  }

  const buy = plan.direction === "buy";
  const px = plan.lastPrice;
  const toEntry = fmtDistance(px, plan.entry);
  const toStop = fmtDistance(px, plan.stop);
  const toT1 = fmtDistance(px, plan.target1);
  const toT2 = plan.target2 != null ? fmtDistance(px, plan.target2) : null;
  const toT3 = plan.target3 != null ? fmtDistance(px, plan.target3) : null;
  const ring =
    plan.state === "Stop Hit"
      ? "ring-bear/40"
      : plan.state === "Active Trade" || plan.state === "Partial Profit" || plan.state === "Target Hit"
        ? "ring-bull/40"
        : "ring-brand/35";

  return (
    <section className={`card overflow-hidden ring-1 ${ring}`}>
      <div
        className={cx(
          "p-4 bg-gradient-to-br via-transparent to-transparent",
          buy ? "from-bull/15" : "from-bear/15",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint mb-1">
              Predictive Trade Plan
            </div>
            <div className={cx("text-xl font-bold tracking-tight", buy ? "text-bull" : "text-bear")}>
              {plan.label}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={plan.stateTone}>{plan.state}</Badge>
              <Badge tone={buy ? "bull" : "bear"}>{plan.setupType}</Badge>
              <Badge tone="brand">{plan.strategyName}</Badge>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ConfidenceRing value={plan.confidence} size={68} label="Conf." />
            <Why
              title={`${plan.label} — Why?`}
              summary={`${plan.state} · ${plan.setupType}`}
              reasoning={plan.reasoning}
              confidence={{
                score: plan.confidence,
                note: `Predictive plan confidence before breakout (${fmtPct(plan.confidence, 0)}).`,
              }}
              evidence={plan.evidenceScores}
              contributions={plan.contributions}
              raw={plan}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <PriceStat label="Entry" value={fmtPrice(plan.entry)} color="text-brand" />
          <PriceStat label="Stop" value={fmtPrice(plan.stop)} color="text-bear" />
          <PriceStat label="Target 1" value={fmtPrice(plan.target1)} color="text-bull" hit={plan.hitFlags.t1} />
          <PriceStat
            label="Target 2"
            value={plan.target2 != null ? fmtPrice(plan.target2) : "—"}
            color="text-info"
            hit={plan.hitFlags.t2}
          />
          {plan.target3 != null && (
            <PriceStat label="Target 3" value={fmtPrice(plan.target3)} color="text-info" hit={plan.hitFlags.t3} />
          )}
          <PriceStat
            label="R:R"
            value={plan.riskReward != null ? fmtNum(plan.riskReward) : "—"}
            color="text-content"
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-faint">
          <span>
            Current <span className="font-mono text-content">{fmtPrice(px)}</span>
          </span>
          <span>
            Entry zone{" "}
            <span className="font-mono text-content">
              {fmtPrice(plan.entryLow)} – {fmtPrice(plan.entryHigh)}
            </span>
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-subtle/40 pt-3">
          <DistStat label="→ Entry" value={toEntry} />
          <DistStat label="→ Stop" value={toStop} warn />
          <DistStat label="→ Target 1" value={toT1} />
          {toT2 && <DistStat label="→ Target 2" value={toT2} />}
          {toT3 && <DistStat label="→ Target 3" value={toT3} />}
        </div>

        {plan.levelExplanations.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-subtle/40 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">Trade plan levels</div>
            {plan.levelExplanations.map((l) => (
              <div key={l.level} className="rounded-lg bg-bg/40 border border-subtle/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-content">{l.level}</span>
                  <span className="font-mono text-xs text-brand">{l.price}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted leading-relaxed">{l.reason}</p>
              </div>
            ))}
            <p className="text-[10px] text-faint">{plan.planValidationNote}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DistStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: ReturnType<typeof fmtDistance>;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-subtle/40 bg-bg/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className={cx("mt-0.5 font-mono text-xs tabular-nums", warn ? "text-bear" : "text-content")}>
        {value.abs} <span className="text-faint">({value.pct})</span>
      </div>
    </div>
  );
}

function PriceStat({
  label,
  value,
  color,
  hit,
}: {
  label: string;
  value: string;
  color: string;
  hit?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border px-2.5 py-2",
        hit ? "border-bull/50 bg-bull/10" : "border-subtle/50 bg-bg/40",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] uppercase tracking-wide text-faint">{label}</span>
        {hit && <span className="text-[9px] font-semibold text-bull">HIT</span>}
      </div>
      <div className={cx("mt-0.5 text-sm font-mono font-semibold tabular-nums", color)}>{value}</div>
    </div>
  );
}
