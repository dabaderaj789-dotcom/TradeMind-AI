import { useDecision } from "../../hooks/useDecision";
import { fmtPrice } from "../../lib/format";
import { Badge, Skeleton } from "../common/primitives";
import type { PredictivePlan } from "../../lib/predictiveSignal";
import type { AiDecision } from "../../lib/decision";
import { useWorkspace } from "../../store/workspace";
import { cx } from "../../lib/format";

/**
 * V4 AI Desk — Bloomberg Terminal–style analysis rail.
 * BUY: plan levels · WAIT: institutional reasoning only.
 * No trading-logic changes.
 */
export function AnalysisPanel({ id, tf }: { id: string; tf: string }) {
  const { decision, predictive, isLoading } = useDecision(id, tf);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);
  const analysisFullscreen = useWorkspace((s) => s.analysisFullscreen);
  const setAnalysisFullscreen = useWorkspace((s) => s.setAnalysisFullscreen);

  const actionable =
    !!decision &&
    (decision.kind === "BUY" ||
      decision.kind === "STRONG BUY" ||
      decision.kind === "SELL" ||
      decision.kind === "STRONG SELL");

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface/95 animate-fade-in">
      {/* Bloomberg-style header strip */}
      <div className="flex shrink-0 items-center gap-2 border-b border-subtle/40 bg-elevated/40 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-faint">
            Analysis · AI Desk
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-display text-[13px] font-semibold tracking-tight text-content">
              Institutional
            </span>
            {decision && (
              <Badge tone={decision.tone}>{decision.kind}</Badge>
            )}
          </div>
        </div>
        <button
          type="button"
          title={analysisFullscreen ? "Exit analysis fullscreen" : "Analysis fullscreen"}
          className={cx("btn-chip !px-2", analysisFullscreen && "btn-chip-active")}
          onClick={() => setAnalysisFullscreen(!analysisFullscreen)}
        >
          <IconExpand />
        </button>
        <button
          type="button"
          title="Collapse AI panel"
          className="btn-chip !px-2"
          onClick={() => {
            setAnalysisFullscreen(false);
            setAiPanelOpen(false);
          }}
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-0 overflow-auto ai-panel-scroll">
        {isLoading && !decision ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : actionable && decision ? (
          <ActionPlanBlock decision={decision} plan={predictive} />
        ) : (
          <WaitBlock decision={decision} />
        )}
      </div>

      <div className="shrink-0 border-t border-subtle/30 px-3 py-2 text-[9px] tracking-wide text-faint">
        TRADEMIND AI · DECISION SUPPORT · NOT FINANCIAL ADVICE
      </div>
    </div>
  );
}

function ActionPlanBlock({
  decision,
  plan,
}: {
  decision: AiDecision;
  plan: PredictivePlan | null;
}) {
  const buy = decision.kind.includes("BUY");
  return (
    <div className="animate-fade-in">
      <div
        className={cx(
          "border-b px-4 py-3",
          buy ? "border-bull/20 bg-bull/5" : "border-bear/20 bg-bear/5",
        )}
      >
        <div className={cx("font-display text-lg font-semibold tracking-tight", buy ? "text-bull" : "text-bear")}>
          {buy ? "LONG SETUP" : "SHORT SETUP"}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {plan?.setupType?.replace(/_/g, " ") ?? decision.setupType} · {plan?.state ?? "Ready"}
        </div>
      </div>

      <table className="w-full border-collapse text-[12px]">
        <tbody>
          <BloombergRow label="ENTRY" value={plan ? fmtPrice(plan.entry) : "—"} accent="brand" />
          <BloombergRow label="STOP LOSS" value={plan ? fmtPrice(plan.stop) : "—"} accent="bear" />
          <BloombergRow label="TP1" value={plan ? fmtPrice(plan.target1) : "—"} accent="info" />
          <BloombergRow
            label="TP2"
            value={plan?.target2 != null ? fmtPrice(plan.target2) : "—"}
            accent="info"
          />
          <BloombergRow
            label="TP3"
            value={plan?.target3 != null ? fmtPrice(plan.target3) : "—"}
            accent="info"
          />
          <BloombergRow label="CONFIDENCE" value={`${Math.round(decision.confidence)}%`} />
          <BloombergRow
            label="INSTITUTIONAL"
            value={`${decision.institutional.score}`}
            sub={decision.institutional.grade}
          />
          {plan?.riskReward != null && (
            <BloombergRow label="R : R" value={`1 : ${plan.riskReward.toFixed(2)}`} />
          )}
        </tbody>
      </table>
    </div>
  );
}

function WaitBlock({ decision }: { decision: AiDecision | null }) {
  if (!decision) {
    return (
      <div className="p-4 text-sm text-muted">Select a symbol to load analysis.</div>
    );
  }

  const reason =
    decision.explainability?.whyNow ||
    decision.reasoning ||
    "Standing aside — conditions are not clear enough to act.";

  return (
    <div className="animate-fade-in">
      <div className="border-b border-warn/20 bg-warn/5 px-4 py-3">
        <div className="font-display text-lg font-semibold tracking-tight text-warn">WAIT</div>
        <div className="mt-0.5 text-[11px] text-muted">Capital preservation mode</div>
      </div>

      <div className="border-b border-subtle/30 px-4 py-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
          Institutional reasoning
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-content">{reason}</p>
      </div>

      {decision.unlockConditions?.length > 0 && (
        <div className="border-b border-subtle/30 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
            Conditions to unlock
          </div>
          <ul className="mt-2 space-y-2">
            {decision.unlockConditions.slice(0, 6).map((u) => (
              <li key={u} className="flex gap-2 text-[12px] leading-snug text-muted">
                <span className="mt-0.5 shrink-0 font-mono text-brand">›</span>
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-4 py-4">
        <div className="rounded-lg border border-subtle/40 bg-elevated/50 px-4 py-3 text-center">
          <div className="text-[9px] uppercase tracking-[0.14em] text-faint">Institutional Score</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-content">
            {decision.institutional.score}
          </div>
          <div className="text-[11px] text-faint">{decision.institutional.grade}</div>
        </div>
      </div>
    </div>
  );
}

function BloombergRow({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "brand" | "bear" | "info";
}) {
  const color =
    accent === "brand"
      ? "text-brand"
      : accent === "bear"
        ? "text-bear"
        : accent === "info"
          ? "text-info"
          : "text-content";
  return (
    <tr className="border-b border-subtle/25 transition-colors hover:bg-elevated/40">
      <td className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
        {label}
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className={`font-mono text-[13px] font-semibold tabular-nums ${color}`}>{value}</span>
        {sub && <div className="text-[10px] text-faint">{sub}</div>}
      </td>
    </tr>
  );
}

function IconExpand() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}
