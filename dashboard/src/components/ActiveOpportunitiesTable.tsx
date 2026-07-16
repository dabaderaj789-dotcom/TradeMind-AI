import { directionTone, fmtNum, fmtPct, fmtPrice, fmtRelative, titleCase } from "../lib/format";
import type { Opportunity } from "../lib/types";
import { Badge, Card, EmptyState, Spinner } from "./ui";

export default function ActiveOpportunitiesTable({
  opportunities,
  loading,
  onSelectSymbol,
}: {
  opportunities: Opportunity[];
  loading: boolean;
  onSelectSymbol: (symbolId: string) => void;
}) {
  const sorted = [...opportunities].sort(
    (a, b) => b.setup.confidence_score - a.setup.confidence_score,
  );

  return (
    <Card title="Active Opportunities" actions={<span className="text-xs text-slate-500">{sorted.length} across watchlist</span>}>
      {loading && sorted.length === 0 ? (
        <Spinner label="Scanning watchlist…" />
      ) : sorted.length === 0 ? (
        <EmptyState>No active opportunities across your watchlist.</EmptyState>
      ) : (
        <div className="overflow-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-base-800">
                <th className="text-left font-medium px-4 py-2">Symbol</th>
                <th className="text-left font-medium px-4 py-2">Setup</th>
                <th className="text-left font-medium px-4 py-2">Bias</th>
                <th className="text-right font-medium px-4 py-2">Confidence</th>
                <th className="text-right font-medium px-4 py-2">R:R</th>
                <th className="text-right font-medium px-4 py-2">Entry</th>
                <th className="text-right font-medium px-4 py-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((op) => {
                const tone = directionTone(op.setup.direction);
                return (
                  <tr
                    key={`${op.symbolId}-${op.setup.setup_id}`}
                    className="border-b border-base-800/60 hover:bg-base-850 cursor-pointer"
                    onClick={() => onSelectSymbol(op.symbolId)}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-100">{op.symbolCode}</td>
                    <td className="px-4 py-2.5 text-slate-300">{titleCase(op.setup.setup_type)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={tone}>{tone === "bull" ? "Long" : tone === "bear" ? "Short" : "—"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-200">
                      {fmtPct(op.setup.confidence_score)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {op.setup.risk_reward != null ? fmtNum(op.setup.risk_reward) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {fmtPrice(op.setup.entry_zone.low)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{fmtRelative(op.setup.detected_at)}</td>
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
