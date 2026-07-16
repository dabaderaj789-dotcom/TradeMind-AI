import type { AiDecision } from "../../lib/decision";
import { fmtPct, fmtTime, titleCase } from "../../lib/format";
import { Badge, ConfidenceRing, Skeleton } from "../common/primitives";
import { Why } from "./Why";

const KIND_STYLES: Record<
  AiDecision["kind"],
  { bg: string; text: string; ring: string; glow: string }
> = {
  "STRONG BUY": {
    bg: "from-bull/25 via-bull/10 to-transparent",
    text: "text-bull",
    ring: "ring-bull/40",
    glow: "shadow-[0_0_40px_-12px_rgba(34,197,94,0.55)]",
  },
  BUY: {
    bg: "from-bull/18 via-bull/8 to-transparent",
    text: "text-bull",
    ring: "ring-bull/30",
    glow: "shadow-[0_0_32px_-14px_rgba(34,197,94,0.4)]",
  },
  WAIT: {
    bg: "from-warn/20 via-warn/8 to-transparent",
    text: "text-warn",
    ring: "ring-warn/35",
    glow: "shadow-[0_0_32px_-14px_rgba(245,158,11,0.35)]",
  },
  SELL: {
    bg: "from-bear/18 via-bear/8 to-transparent",
    text: "text-bear",
    ring: "ring-bear/30",
    glow: "shadow-[0_0_32px_-14px_rgba(239,68,68,0.4)]",
  },
  "STRONG SELL": {
    bg: "from-bear/25 via-bear/10 to-transparent",
    text: "text-bear",
    ring: "ring-bear/40",
    glow: "shadow-[0_0_40px_-12px_rgba(239,68,68,0.55)]",
  },
};

export function DecisionCard({
  decision,
  loading,
  compact = false,
}: {
  decision: AiDecision | null;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading || !decision) {
    return (
      <section className="card overflow-hidden">
        <div className="p-4">
          <Skeleton className={compact ? "h-20" : "h-28"} />
        </div>
      </section>
    );
  }

  const style = KIND_STYLES[decision.kind];
  const inst = decision.institutional;
  const health = decision.marketHealth;

  if (compact) {
    return (
      <section className={`card overflow-hidden ring-1 ${style.ring}`}>
        <div className={`bg-gradient-to-br ${style.bg} p-3.5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">AI Decision</div>
              <div className={`mt-0.5 text-xl font-bold tracking-tight ${style.text}`}>{decision.kind}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Badge tone={inst.gradeTone}>{inst.score} · {inst.grade}</Badge>
                <Badge tone={decision.tone}>{Math.round(decision.confidence)}%</Badge>
                <Badge tone={decision.riskTone}>{decision.riskLabel}</Badge>
              </div>
            </div>
            <ConfidenceRing value={inst.score} size={56} label="Inst." />
          </div>
          {!decision.actionable && (
            <p className="mt-2 text-[11px] leading-snug text-muted line-clamp-2">{decision.reasoning}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={`card overflow-hidden ring-1 ${style.ring} ${style.glow}`}>
      <div className={`bg-gradient-to-br ${style.bg} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              AI Decision
            </div>
            <div className={`text-2xl font-bold tracking-tight ${style.text}`}>{decision.kind}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={inst.gradeTone}>Institutional · {inst.score} ({inst.grade})</Badge>
              <Badge tone={decision.tradeQualityTone}>{decision.tradeQuality} quality</Badge>
              <Badge tone={decision.riskTone}>Risk · {decision.riskLabel}</Badge>
              {!decision.actionable && <Badge tone="warn">Standing aside</Badge>}
              {decision.selfReview.passed && <Badge tone="bull">Self-review ✓</Badge>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ConfidenceRing value={inst.score} size={72} label="Inst." />
            <Why
              title={`${decision.kind} — Why?`}
              summary={`${decision.setupType} · ${decision.strategyName}`}
              reasoning={decision.reasoning}
              confidence={{
                score: decision.confidence,
                note: `Geometric composite across structure, SMC, volume, MTF, and strategy (${fmtPct(decision.confidence, 0)}).`,
              }}
              evidence={decision.confidenceFactors}
              contributions={decision.contributions}
              explainability={decision.explainability}
              qualityChecks={decision.qualityChecks}
              raw={decision}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1.5 text-[10px]">
          <HealthPill label="Trend" value={health.trend} />
          <HealthPill label="Volatility" value={health.volatility} />
          <HealthPill label="Liquidity" value={health.liquidity} />
          <HealthPill label="Momentum" value={health.momentum} />
          <HealthPill label="Phase" value={health.phase} />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px]">
          {decision.mtf.timeframes.map((t) => (
            <div key={t.timeframe} className="rounded-lg border border-subtle/40 bg-bg/40 px-2 py-1.5 text-center">
              <div className="text-[9px] uppercase text-faint">{t.timeframe}</div>
              <div className={`mt-0.5 font-semibold ${t.bias === "Bullish" ? "text-bull" : t.bias === "Bearish" ? "text-bear" : "text-muted"}`}>
                {t.bias}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
          <Meta label="Trade quality" value={`${decision.signalQuality.tradeQualityScore}`} />
          <Meta label="Institutional" value={`${decision.signalQuality.institutionalScore}`} />
          <Meta label="Confidence" value={`${Math.round(decision.signalQuality.confidence)}%`} />
          <Meta
            label="Hist. similarity"
            value={`${Math.round(decision.signalQuality.historicalSimilarity)}%`}
          />
          <Meta
            label="Expected risk"
            value={
              decision.signalQuality.expectedRiskPct != null
                ? `${decision.signalQuality.expectedRiskPct.toFixed(2)}%`
                : "—"
            }
          />
          <Meta
            label="Expected reward"
            value={
              decision.signalQuality.expectedRewardPct != null
                ? `${decision.signalQuality.expectedRewardPct.toFixed(2)}%`
                : "—"
            }
          />
          <Meta label="Setup" value={decision.setupType} />
          <Meta label="Strategy" value={decision.strategyName} />
          <Meta label="MTF" value={decision.mtf.aligned ? "Aligned" : "Conflict"} />
          <Meta label="As of" value={fmtTime(decision.timestamp)} />
        </div>

        <div className="mt-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-wide text-faint">Evidence summary</div>
          <div className="flex flex-wrap gap-1.5">
            {decision.evidenceSummary.map((e) => (
              <span key={e} className="pill border border-subtle/40 bg-bg/50 text-muted">
                {e}
              </span>
            ))}
          </div>
        </div>

        {!decision.actionable && decision.rejectionReasons.length > 0 && (
          <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warn">
              Why WAIT
            </div>
            <ul className="space-y-1 text-[11px] leading-snug text-muted">
              {decision.rejectionReasons.slice(0, 6).map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
            {decision.unlockConditions.length > 0 && (
              <>
                <div className="mb-1 mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                  Before BUY / SELL
                </div>
                <ul className="space-y-1 text-[11px] leading-snug text-muted">
                  {decision.unlockConditions.slice(0, 5).map((u) => (
                    <li key={u}>· {u}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-muted">
          {decision.setup ? `${titleCase(decision.setup.direction)} · ` : ""}
          {decision.reasoning}
        </p>
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-subtle/40 bg-bg/40 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 truncate text-[12px] font-medium text-content">{value}</div>
    </div>
  );
}

function HealthPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-subtle/40 bg-bg/40 px-2 py-1.5 text-center">
      <div className="text-[8px] uppercase text-faint">{label}</div>
      <div className="mt-0.5 truncate font-medium text-content">{value}</div>
    </div>
  );
}
