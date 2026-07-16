import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../../lib/endpoints";
import { Badge, Skeleton } from "../common/primitives";

/** Developer accuracy panel — our candles vs live provider reference feed. */
export function OhlcComparePanel({
  symbolId,
  timeframe,
}: {
  symbolId: string;
  timeframe: string;
}) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["ohlc-compare", symbolId, timeframe],
    queryFn: ({ signal }) => endpoints.ohlcCompare(symbolId, timeframe, 40, signal),
    enabled: !!symbolId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <section className="card p-3">
        <Skeleton className="h-24" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="card border-bear/30 p-3 text-sm text-muted">
        Compare feed unavailable.{" "}
        <button type="button" className="text-brand underline" onClick={() => void refetch()}>
          Retry
        </button>
        <div className="mt-1 text-[11px] text-faint">{String((error as Error)?.message ?? "")}</div>
      </section>
    );
  }

  const c = data.comparison;
  const ok = c.mismatches === 0;

  return (
    <section className="card overflow-hidden ring-1 ring-subtle/50">
      <div className="flex items-start justify-between gap-2 border-b border-subtle/50 px-3 py-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
            OHLC Compare · Dev
          </div>
          <div className="mt-0.5 text-sm font-semibold text-content">
            {data.symbol_code} · {data.timeframe}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            Ours: {data.our_source} · Ref: {data.reference_provider}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={ok ? "bull" : "bear"}>{ok ? "MATCH" : `${c.mismatches} DIFF`}</Badge>
          <span className="font-mono text-[11px] text-muted">{c.match_rate}% align</span>
          <button
            type="button"
            className="text-[10px] text-brand underline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="border-b border-subtle/40 px-3 py-2 text-[11px] text-faint leading-relaxed">
        {data.reference_note} Tolerance ±{c.price_tolerance_pct}% price
        {c.volume_tolerance_pct != null ? ` / ±${c.volume_tolerance_pct}% volume` : ""} / {c.time_tolerance_sec}s time.
        {data.yahoo_ticker ? ` Yahoo ticker: ${data.yahoo_ticker}.` : ""}
      </p>

      <div className="max-h-48 overflow-auto">
        <table className="w-full text-left text-[10px]">
          <thead className="sticky top-0 bg-surface text-faint">
            <tr>
              <th className="px-2 py-1.5 font-medium">Time</th>
              <th className="px-2 py-1.5 font-medium">Δt</th>
              <th className="px-2 py-1.5 font-medium">O%</th>
              <th className="px-2 py-1.5 font-medium">H%</th>
              <th className="px-2 py-1.5 font-medium">L%</th>
              <th className="px-2 py-1.5 font-medium">C%</th>
              <th className="px-2 py-1.5 font-medium">V%</th>
              <th className="px-2 py-1.5 font-medium">Flag</th>
            </tr>
          </thead>
          <tbody>
            {c.rows
              .slice()
              .reverse()
              .map((r) => (
                <tr
                  key={`${r.index}-${r.open_time}`}
                  className={r.mismatch ? "bg-bear/10 text-bear" : "text-muted"}
                >
                  <td className="px-2 py-1 font-mono whitespace-nowrap">
                    {new Date(r.open_time).toLocaleString("en-GB", {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-2 py-1 font-mono">{r.time_diff_sec}s</td>
                  <td className="px-2 py-1 font-mono">{(r.open.pct * 100).toFixed(4)}</td>
                  <td className="px-2 py-1 font-mono">{(r.high.pct * 100).toFixed(4)}</td>
                  <td className="px-2 py-1 font-mono">{(r.low.pct * 100).toFixed(4)}</td>
                  <td className="px-2 py-1 font-mono">{(r.close.pct * 100).toFixed(4)}</td>
                  <td className="px-2 py-1 font-mono">
                    {r.volume?.skipped ? "—" : ((r.volume?.pct ?? 0) * 100).toFixed(2)}
                  </td>
                  <td className="px-2 py-1">{r.mismatch ? "≠" : "✓"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Developer quote verification — price, OHLC, volume vs fresh provider. */
export function QuoteVerifyPanel({ symbolId }: { symbolId: string }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["quote-verify", symbolId],
    queryFn: ({ signal }) => endpoints.quoteVerify(symbolId, signal),
    enabled: !!symbolId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <section className="card p-3">
        <Skeleton className="h-16" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="card border-bear/30 p-3 text-sm text-muted">
        Quote verify unavailable.{" "}
        <button type="button" className="text-brand underline" onClick={() => void refetch()}>
          Retry
        </button>
        <div className="mt-1 text-[11px] text-faint">{String((error as Error)?.message ?? "")}</div>
      </section>
    );
  }

  const v = data.verification;
  const ok = v.ok;

  return (
    <section className={`card overflow-hidden ring-1 ${ok ? "ring-bull/30" : "ring-bear/40"}`}>
      <div className="flex items-start justify-between gap-2 border-b border-subtle/50 px-3 py-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
            Quote Verify · Dev
          </div>
          <div className="mt-0.5 text-sm font-semibold text-content">{data.quote.symbol_code}</div>
          <div className="mt-0.5 text-[11px] text-muted">Ref: {v.reference_provider}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={ok ? "bull" : "bear"}>{ok ? "VERIFIED" : `${v.mismatches} MISMATCH`}</Badge>
          <button
            type="button"
            className="text-[10px] text-brand underline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Refresh
          </button>
        </div>
      </div>

      {!ok && (
        <div className="border-b border-bear/20 bg-bear/5 px-3 py-2 text-[11px] text-bear">
          Provider mismatch detected — displayed prices may not match the live feed.
        </div>
      )}

      <div className="max-h-36 overflow-auto">
        <table className="w-full text-left text-[10px]">
          <thead className="sticky top-0 bg-surface text-faint">
            <tr>
              <th className="px-2 py-1.5 font-medium">Field</th>
              <th className="px-2 py-1.5 font-medium">Ours</th>
              <th className="px-2 py-1.5 font-medium">Ref</th>
              <th className="px-2 py-1.5 font-medium">Δ%</th>
            </tr>
          </thead>
          <tbody>
            {(v.checks.length ? v.checks : [{ field: "all", ours: "—", reference: "—", pct_diff: 0 }]).map((c) => (
              <tr key={c.field} className={v.checks.length ? "text-bear" : "text-bull"}>
                <td className="px-2 py-1 font-medium">{c.field}</td>
                <td className="px-2 py-1 font-mono">{String(c.ours)}</td>
                <td className="px-2 py-1 font-mono">{String(c.reference)}</td>
                <td className="px-2 py-1 font-mono">
                  {"unit" in c && c.unit === "seconds" ? `${c.pct_diff}s` : `${c.pct_diff}%`}
                </td>
              </tr>
            ))}
            {v.checks.length === 0 && (
              <tr className="text-muted">
                <td className="px-2 py-1" colSpan={4}>
                  Price, day high/low, volume, and timestamp within tolerance (±0.01% price).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
