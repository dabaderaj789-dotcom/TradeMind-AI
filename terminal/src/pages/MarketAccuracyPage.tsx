/**
 * V7 Market Accuracy — provider self-check + documented Angel One / TV limits.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/apiClient";
import { cx } from "../lib/format";

interface Row {
  symbol_code: string;
  exchange: string;
  ours: number | null;
  reference: number | null;
  reference_provider: string;
  price_diff: number | null;
  price_diff_pct: number | null;
  ok: boolean;
  note: string | null;
}

interface Report {
  generated_at: string;
  results: Row[];
  summary: { checked: number; ok: number; failed: number };
  limitations: string[];
}

export function MarketAccuracyPage() {
  const q = useQuery({
    queryKey: ["market-accuracy"],
    queryFn: ({ signal }) => apiGet<Report>("/market-engine/accuracy-report", signal),
    refetchInterval: 15_000,
  });

  const report = q.data;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-auto p-4 lg:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">V7 Market Engine</div>
          <h1 className="font-display text-xl font-bold">Market Accuracy</h1>
          <p className="mt-1 text-sm text-muted">
            Live self-check vs the same provider we use (Yahoo/NSE / Binance). Manual Angel One /
            TradingView diffs belong in the limitations list — we cannot scrape those UIs.
          </p>
        </div>
        <button type="button" className="btn-chip" onClick={() => void q.refetch()}>
          Re-run
        </button>
      </header>

      {report && (
        <div className="flex flex-wrap gap-3 text-sm">
          <Pill label="Checked" value={String(report.summary.checked)} />
          <Pill label="OK" value={String(report.summary.ok)} tone="bull" />
          <Pill label="Failed" value={String(report.summary.failed)} tone="bear" />
          <span className="text-xs text-faint">
            {new Date(report.generated_at).toLocaleString()}
          </span>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-elevated text-[10px] uppercase text-faint">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Ours</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">Δ%</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(report?.results ?? []).map((r) => (
              <tr key={r.symbol_code} className="border-t border-subtle/50">
                <td className="px-3 py-2 font-semibold">
                  {r.symbol_code}
                  <div className="text-[10px] font-normal text-faint">
                    {r.exchange} · {r.reference_provider}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">{r.ours ?? "—"}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{r.reference ?? "—"}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{r.price_diff ?? "—"}</td>
                <td className="px-3 py-2 font-mono tabular-nums">
                  {r.price_diff_pct != null ? `${r.price_diff_pct}%` : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={cx("text-xs font-bold", r.ok ? "text-bull" : "text-bear")}>
                    {r.ok ? "OK" : "FAIL"}
                  </span>
                  {r.note && <div className="text-[10px] text-faint">{r.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-warn/30 bg-warn/5 p-4">
        <h2 className="text-sm font-bold text-content">Remaining limitations</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {(report?.limitations ?? []).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="mt-3 text-xs text-faint">
          Manual check: compare NIFTY / BANKNIFTY / SENSEX / BTCUSDT LTP and the forming 5m OHLC against Angel
          One and TradingView side-by-side. Expect India LTP within a few points / seconds of Angel One; not
          identical tick-for-tick.
        </div>
      </section>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface px-3 py-1.5">
      <div className="text-[9px] font-bold uppercase text-faint">{label}</div>
      <div
        className={cx(
          "font-mono text-sm font-bold",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default MarketAccuracyPage;
