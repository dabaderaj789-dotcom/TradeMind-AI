import type { AnalystBrief } from "../../lib/analystBrief";
import { fmtPrice } from "../../lib/format";
import { Badge, Card, Skeleton } from "../common/primitives";

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-subtle/30 last:border-0">
      <span className="text-[11px] text-faint shrink-0">{label}</span>
      <span className={`text-[11px] text-content text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="pt-3 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint first:pt-0">
      {children}
    </div>
  );
}

export function AnalystBriefCard({
  brief,
  loading,
}: {
  brief: AnalystBrief | null;
  loading?: boolean;
}) {
  if (loading || !brief) {
    return (
      <Card title="Analyst Brief">
        <Skeleton className="h-40" />
      </Card>
    );
  }

  const rr =
    brief.expectedRr != null && Number.isFinite(brief.expectedRr)
      ? `1 : ${brief.expectedRr.toFixed(2)}`
      : "—";

  const biasTone = brief.marketBiasTone === "bull" ? "bull" : brief.marketBiasTone === "bear" ? "bear" : "neutral";

  return (
    <Card
      title="Analyst Brief"
      subtitle="Institutional market read"
      actions={
        <Badge tone={brief.institutionalScore >= 82 ? "bull" : brief.institutionalScore >= 70 ? "brand" : "warn"}>
          Inst. {brief.institutionalScore}
        </Badge>
      }
    >
      <SectionLabel>Market View</SectionLabel>
      <div className="space-y-0.5">
        <Row label="Market Bias" value={brief.marketBias} />
        <Row label="Trend" value={brief.trend} />
        <Row label="Market Structure" value={brief.structure} />
        <Row label="Market Phase" value={brief.marketPhase} />
      </div>

      <SectionLabel>Order Flow &amp; Liquidity</SectionLabel>
      <div className="space-y-0.5">
        <Row label="Order Flow" value={brief.orderFlow} />
        <Row label="Liquidity" value={brief.liquidityStatus} />
      </div>

      <SectionLabel>Key Levels</SectionLabel>
      <div className="space-y-0.5">
        <Row
          label="Nearest Support"
          value={brief.nearestSupport != null ? fmtPrice(brief.nearestSupport) : "—"}
          mono
        />
        <Row
          label="Nearest Resistance"
          value={brief.nearestResistance != null ? fmtPrice(brief.nearestResistance) : "—"}
          mono
        />
        <Row
          label="Active Order Block"
          value={
            brief.nearestOb
              ? `${brief.nearestOb.label} · ${fmtPrice(brief.nearestOb.low)}–${fmtPrice(brief.nearestOb.high)} (${Math.round(brief.nearestOb.confidence)}%)`
              : "None active"
          }
        />
        <Row
          label="Active Fair Value Gap"
          value={
            brief.nearestFvg
              ? `${brief.nearestFvg.label} · ${fmtPrice(brief.nearestFvg.low)}–${fmtPrice(brief.nearestFvg.high)} (${Math.round(brief.nearestFvg.confidence)}%)`
              : "None open"
          }
        />
      </div>

      <SectionLabel>Trade Thesis</SectionLabel>
      <div className="rounded-lg border border-subtle/40 bg-elevated/40 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <Badge tone={biasTone === "neutral" ? "warn" : biasTone}>{brief.decisionLabel}</Badge>
          <span className="text-[10px] text-faint">Confidence {Math.round(brief.confidence)}%</span>
          <span className="text-[10px] text-faint">R:R {rr}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-muted leading-relaxed">{brief.tradeThesis}</p>
      </div>

      <div className="mt-2 rounded-lg border border-bear/20 bg-bear/5 px-2.5 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-bear/80">What invalidates this</div>
        <p className="mt-1 text-[11px] text-muted leading-relaxed">{brief.invalidation}</p>
      </div>

      {brief.whyWait && (
        <div className="mt-2 rounded-lg border border-warn/25 bg-warn/5 px-2.5 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-warn">Why WAIT</div>
          <p className="mt-1 text-[11px] text-muted leading-relaxed">{brief.whyWait}</p>
        </div>
      )}

      {brief.unlockBeforeBuy.length > 0 && (
        <div className="mt-2 rounded-lg border border-brand/20 bg-brand/5 px-2.5 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-brand">
            Before BUY / SELL becomes valid
          </div>
          <ul className="mt-1.5 space-y-1">
            {brief.unlockBeforeBuy.map((u) => (
              <li key={u} className="text-[11px] text-muted leading-snug flex gap-1.5">
                <span className="text-brand shrink-0">→</span>
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-elevated/50 px-2.5 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wide text-faint">Confidence</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-content">{Math.round(brief.confidence)}%</div>
        </div>
        <div className="rounded-lg bg-elevated/50 px-2.5 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wide text-faint">Institutional</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-content">
            {brief.institutionalScore} · {brief.institutionalGrade}
          </div>
        </div>
      </div>
    </Card>
  );
}
