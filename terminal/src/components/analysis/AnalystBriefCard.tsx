import type { AnalystBrief } from "../../lib/analystBrief";
import { fmtPrice } from "../../lib/format";
import { Badge, Card, Skeleton } from "../common/primitives";

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-subtle/20 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] text-faint">{label}</span>
      <span className={`text-right text-[11px] text-content ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="pb-1 pt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-faint first:pt-0">
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
      <Card title="Brief">
        <Skeleton className="h-40" />
      </Card>
    );
  }

  const rr =
    brief.expectedRr != null && Number.isFinite(brief.expectedRr)
      ? `1 : ${brief.expectedRr.toFixed(2)}`
      : "—";

  const biasTone =
    brief.marketBiasTone === "bull" ? "bull" : brief.marketBiasTone === "bear" ? "bear" : "neutral";

  return (
    <Card
      title="Institutional read"
      actions={
        <Badge tone={brief.institutionalScore >= 82 ? "bull" : brief.institutionalScore >= 70 ? "brand" : "warn"}>
          Inst. {brief.institutionalScore}
        </Badge>
      }
    >
      <SectionLabel>Market view</SectionLabel>
      <div className="space-y-0.5">
        <Row label="Bias" value={brief.marketBias} />
        <Row label="Trend" value={brief.trend} />
        <Row label="Structure" value={brief.structure} />
        <Row label="Phase" value={brief.marketPhase} />
      </div>

      <SectionLabel>Flow &amp; liquidity</SectionLabel>
      <div className="space-y-0.5">
        <Row label="Order flow" value={brief.orderFlow} />
        <Row label="Liquidity" value={brief.liquidityStatus} />
      </div>

      <SectionLabel>Key levels</SectionLabel>
      <div className="space-y-0.5">
        <Row
          label="Support"
          value={brief.nearestSupport != null ? fmtPrice(brief.nearestSupport) : "—"}
          mono
        />
        <Row
          label="Resistance"
          value={brief.nearestResistance != null ? fmtPrice(brief.nearestResistance) : "—"}
          mono
        />
        <Row
          label="Order block"
          value={
            brief.nearestOb
              ? `${brief.nearestOb.label} · ${fmtPrice(brief.nearestOb.low)}–${fmtPrice(brief.nearestOb.high)}`
              : "None active"
          }
        />
        <Row
          label="Fair value gap"
          value={
            brief.nearestFvg
              ? `${brief.nearestFvg.label} · ${fmtPrice(brief.nearestFvg.low)}–${fmtPrice(brief.nearestFvg.high)}`
              : "None open"
          }
        />
      </div>

      <SectionLabel>Thesis</SectionLabel>
      <div className="rounded-lg border border-subtle/30 bg-elevated/40 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={biasTone === "neutral" ? "warn" : biasTone}>{brief.decisionLabel}</Badge>
          <span className="font-mono text-[10px] text-faint">{Math.round(brief.confidence)}%</span>
          <span className="font-mono text-[10px] text-faint">R:R {rr}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{brief.tradeThesis}</p>
      </div>

      <div className="mt-2 rounded-lg border border-bear/20 bg-bear/5 px-3 py-2.5">
        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-bear/80">
          Invalidation
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{brief.invalidation}</p>
      </div>

      {brief.whyWait && (
        <div className="mt-2 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-warn">Why WAIT</div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{brief.whyWait}</p>
        </div>
      )}

      {brief.unlockBeforeBuy.length > 0 && (
        <div className="mt-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-brand">
            Before BUY / SELL
          </div>
          <ul className="mt-1.5 space-y-1">
            {brief.unlockBeforeBuy.map((u) => (
              <li key={u} className="flex gap-1.5 text-[11px] leading-snug text-muted">
                <span className="shrink-0 text-brand">→</span>
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-elevated/50 px-2.5 py-2.5 text-center">
          <div className="text-[9px] uppercase tracking-[0.12em] text-faint">Confidence</div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-content">
            {Math.round(brief.confidence)}%
          </div>
        </div>
        <div className="rounded-lg bg-elevated/50 px-2.5 py-2.5 text-center">
          <div className="text-[9px] uppercase tracking-[0.12em] text-faint">Institutional</div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-content">
            {brief.institutionalScore}
          </div>
        </div>
      </div>
    </Card>
  );
}
