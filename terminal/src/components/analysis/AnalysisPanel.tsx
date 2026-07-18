import { useDecision } from "../../hooks/useDecision";
import { fmtPrice } from "../../lib/format";
import { Badge, Card, Skeleton } from "../common/primitives";
import type { PredictivePlan } from "../../lib/predictiveSignal";
import type { AiDecision } from "../../lib/decision";

/** V3 AI rail — BUY shows plan levels; WAIT shows institutional reasoning only. */
export function AnalysisPanel({ id, tf }: { id: string; tf: string }) {
  const { decision, predictive, isLoading } = useDecision(id, tf);
  const actionable =
    !!decision &&
    (decision.kind === "BUY" ||
      decision.kind === "STRONG BUY" ||
      decision.kind === "SELL" ||
      decision.kind === "STRONG SELL");

  return (
    <div className="h-full space-y-3 overflow-auto p-3 ai-panel-scroll animate-fade-in">
      <div className="px-0.5 pb-0.5">
        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-faint">AI Desk</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-display text-sm font-semibold tracking-tight text-content">Decision</span>
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
        </div>
      </div>

      {isLoading && !decision ? (
        <Card title="Loading">
          <Skeleton className="h-36" />
        </Card>
      ) : actionable && decision ? (
        <ActionPlanCard decision={decision} plan={predictive} />
      ) : (
        <WaitReasoningCard decision={decision} />
      )}
    </div>
  );
}

function ActionPlanCard({
  decision,
  plan,
}: {
  decision: AiDecision;
  plan: PredictivePlan | null;
}) {
  const buy = decision.kind.includes("BUY");
  return (
    <Card
      title={buy ? "Trade plan · BUY" : "Trade plan · SELL"}
      actions={<Badge tone={buy ? "bull" : "bear"}>{Math.round(decision.confidence)}%</Badge>}
    >
      <div className="space-y-0">
        <LevelRow label="Entry" value={plan ? fmtPrice(plan.entry) : "—"} accent="brand" />
        <LevelRow label="Stop Loss" value={plan ? fmtPrice(plan.stop) : "—"} accent="bear" />
        <LevelRow label="TP1" value={plan ? fmtPrice(plan.target1) : "—"} accent="info" />
        <LevelRow
          label="TP2"
          value={plan?.target2 != null ? fmtPrice(plan.target2) : "—"}
          accent="info"
        />
        <LevelRow
          label="TP3"
          value={plan?.target3 != null ? fmtPrice(plan.target3) : "—"}
          accent="info"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Confidence" value={`${Math.round(decision.confidence)}%`} />
        <Metric
          label="Institutional Score"
          value={`${decision.institutional.score}`}
          sub={decision.institutional.grade}
        />
      </div>

      {plan?.setupType && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {plan.setupType.replace(/_/g, " ")}
          {plan.state ? ` · ${plan.state}` : ""}
        </p>
      )}
    </Card>
  );
}

function WaitReasoningCard({ decision }: { decision: AiDecision | null }) {
  if (!decision) {
    return (
      <Card title="Institutional reasoning">
        <p className="text-sm text-muted">Select a symbol to load the AI desk.</p>
      </Card>
    );
  }

  const reason =
    decision.explainability?.whyNow ||
    decision.reasoning ||
    "Standing aside — conditions are not clear enough to act.";

  return (
    <Card title="Institutional reasoning" actions={<Badge tone="warn">WAIT</Badge>}>
      <p className="text-[13px] leading-relaxed text-content">{reason}</p>

      {decision.unlockConditions?.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-subtle/30 pt-3">
          {decision.unlockConditions.slice(0, 5).map((u) => (
            <li key={u} className="flex gap-2 text-[12px] leading-snug text-muted">
              <span className="shrink-0 text-brand">→</span>
              <span>{u}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-lg bg-elevated/50 px-3 py-2.5 text-center">
        <div className="text-[9px] uppercase tracking-[0.12em] text-faint">Institutional Score</div>
        <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-content">
          {decision.institutional.score}
        </div>
        <div className="text-[10px] text-faint">{decision.institutional.grade}</div>
      </div>
    </Card>
  );
}

function LevelRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "brand" | "bear" | "info";
}) {
  const color =
    accent === "brand" ? "text-brand" : accent === "bear" ? "text-bear" : "text-info";
  return (
    <div className="flex items-center justify-between border-b border-subtle/25 py-2.5 last:border-0">
      <span className="text-xs text-faint">{label}</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-elevated/50 px-2.5 py-2.5 text-center">
      <div className="text-[9px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums text-content">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-faint">{sub}</div>}
    </div>
  );
}
