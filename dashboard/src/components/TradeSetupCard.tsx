import { directionTone, fmtNum, fmtPrice, fmtRelative, titleCase } from "../lib/format";
import type { TradeSetup } from "../lib/types";
import ConfidenceScore from "./ConfidenceScore";
import { Badge, Card, EmptyState, Stat } from "./ui";

export default function TradeSetupCard({ setup, loading }: { setup: TradeSetup | null; loading: boolean }) {
  const tone = directionTone(setup?.direction);
  const t1 = setup?.target_zones?.[0];

  return (
    <Card
      title="Current Trade Setup"
      actions={setup && <span className="text-xs text-slate-500">{fmtRelative(setup.detected_at)}</span>}
    >
      {loading && !setup ? (
        <EmptyState>Loading trade setup…</EmptyState>
      ) : !setup ? (
        <EmptyState>No active trade setup for this symbol / timeframe.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge tone={tone}>{tone === "bull" ? "Long" : tone === "bear" ? "Short" : "Neutral"}</Badge>
                <span className="text-sm font-semibold text-slate-100">{titleCase(setup.setup_type)}</span>
              </div>
              <div className="text-xs text-slate-500">
                {titleCase(setup.confidence_level)} confidence · {titleCase(setup.status)}
              </div>
            </div>
            <ConfidenceScore value={setup.confidence_score} size={84} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Entry" value={`${fmtPrice(setup.entry_zone.low)}–${fmtPrice(setup.entry_zone.high)}`} />
            <Stat label="Stop" value={fmtPrice(setup.stop_loss_zone.low)} tone="bear" />
            <Stat label="Target 1" value={t1 ? fmtPrice(t1.low) : "—"} tone="bull" />
            <Stat label="R:R" value={setup.risk_reward != null ? fmtNum(setup.risk_reward) : "—"} tone="brand" />
          </div>

          {setup.target_zones.length > 1 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {setup.target_zones.map((z, i) => (
                <span key={i} className="pill bg-base-800 text-slate-300 font-mono">
                  TP{i + 1} {fmtPrice(z.low)}
                </span>
              ))}
            </div>
          )}

          {setup.explanation && (
            <p className="text-xs text-slate-500 leading-relaxed border-t border-base-800 pt-3">
              {setup.explanation}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
