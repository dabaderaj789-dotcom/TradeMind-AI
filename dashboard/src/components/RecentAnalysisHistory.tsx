import { directionTone, fmtPct, fmtPrice, fmtTime, titleCase } from "../lib/format";
import type { TradeSetup } from "../lib/types";
import { Badge, Card, EmptyState, Spinner } from "./ui";

export default function RecentAnalysisHistory({
  setups,
  loading,
}: {
  setups: TradeSetup[];
  loading: boolean;
}) {
  return (
    <Card title="Recent Analysis History" actions={<span className="text-xs text-slate-500">Last {setups.length}</span>}>
      {loading && setups.length === 0 ? (
        <Spinner />
      ) : setups.length === 0 ? (
        <EmptyState>No historical analysis recorded for this symbol / timeframe.</EmptyState>
      ) : (
        <div className="overflow-auto -mx-4 max-h-80">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-base-900">
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-base-800">
                <th className="text-left font-medium px-4 py-2">Detected</th>
                <th className="text-left font-medium px-4 py-2">Setup</th>
                <th className="text-left font-medium px-4 py-2">Bias</th>
                <th className="text-right font-medium px-4 py-2">Confidence</th>
                <th className="text-right font-medium px-4 py-2">Entry</th>
                <th className="text-left font-medium px-4 py-2 pl-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {setups.map((s) => {
                const tone = directionTone(s.direction);
                return (
                  <tr key={s.setup_id} className="border-b border-base-800/60">
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{fmtTime(s.detected_at)}</td>
                    <td className="px-4 py-2.5 text-slate-300">{titleCase(s.setup_type)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={tone}>{tone === "bull" ? "Long" : tone === "bear" ? "Short" : "—"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-200">{fmtPct(s.confidence_score)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">{fmtPrice(s.entry_zone.low)}</td>
                    <td className="px-4 py-2.5 pl-6 text-slate-400">{titleCase(s.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
