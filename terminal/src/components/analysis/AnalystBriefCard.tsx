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

  return (
    <Card
      title="Analyst Brief"
      subtitle="Structure · Smart Money · Plan gates"
      actions={
        <Badge tone={brief.institutionalScore >= 82 ? "bull" : brief.institutionalScore >= 70 ? "brand" : "warn"}>
          Inst. {brief.institutionalScore}
        </Badge>
      }
    >
      <div className="space-y-0.5">
        <Row label="Current Trend" value={brief.trend} />
        <Row label="Current Structure" value={brief.structure} />
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
          label="Nearest Order Block"
          value={
            brief.nearestOb
              ? `${brief.nearestOb.label} · ${fmtPrice(brief.nearestOb.low)}–${fmtPrice(brief.nearestOb.high)} (${Math.round(brief.nearestOb.confidence)}%)`
              : "None active"
          }
        />
        <Row
          label="Nearest FVG"
          value={
            brief.nearestFvg
              ? `${brief.nearestFvg.label} · ${fmtPrice(brief.nearestFvg.low)}–${fmtPrice(brief.nearestFvg.high)} (${Math.round(brief.nearestFvg.confidence)}%)`
              : "None open"
          }
        />
        <Row label="Liquidity" value={brief.liquidityStatus} />
        <Row label="Market Phase" value={brief.marketPhase} />
        <Row label="Expected R:R" value={rr} mono />
        <Row
          label="Institutional Score"
          value={`${brief.institutionalScore} · ${brief.institutionalGrade}`}
        />
      </div>

      {brief.whyWait && (
        <div className="mt-3 rounded-lg border border-warn/25 bg-warn/5 px-2.5 py-2">
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
    </Card>
  );
}
