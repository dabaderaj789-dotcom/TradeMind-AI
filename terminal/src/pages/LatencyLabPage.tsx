/**
 * V7 Latency Lab — end-to-end tick timing for the active chart stream.
 */

import { useLatencyLab } from "../store/latencyLab";
import { useConnection } from "../store/connection";
import { cx } from "../lib/format";

export function LatencyLabPage() {
  const latest = useLatencyLab((s) => s.latest);
  const history = useLatencyLab((s) => s.history);
  const conn = useConnection();

  const rows = [
    { label: "Feed Delay (provider → backend)", ms: latest?.feedDelayMs, hint: "Yahoo/NSE/Binance stamp lag" },
    { label: "Backend Delay", ms: latest?.backendDelayMs, hint: "API processing" },
    { label: "Transport Delay", ms: latest?.transportDelayMs, hint: "Backend sent → frontend receive" },
    { label: "Render Delay", ms: latest?.renderDelayMs, hint: "Receive → chart series.update" },
    { label: "Total Latency", ms: latest?.totalDelayMs, hint: "Provider stamp → render (when available)" },
  ];

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-auto p-4 lg:p-6">
      <header>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">V7 Market Engine</div>
        <h1 className="font-display text-xl font-bold text-content">Latency Lab</h1>
        <p className="mt-1 text-sm text-muted">
          Open a chart to stream ticks. Values update from the live tip path — not synthetic.
        </p>
      </header>

      <div className="rounded-xl border border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-content">Stream</span>
          <span className="text-muted">{conn.provider || "—"}</span>
          <span
            className={cx(
              "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
              conn.status === "live" ? "bg-bull/15 text-bull" : "bg-elevated text-faint",
            )}
          >
            {conn.status}
          </span>
          {latest?.source && <span className="font-mono text-xs text-faint">{latest.source}</span>}
          {latest?.bottleneck && (
            <span className="rounded bg-warn/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warn">
              Bottleneck: {latest.bottleneck}
            </span>
          )}
        </div>
        {latest && (
          <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-content">
            {latest.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-subtle bg-surface px-3 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{r.label}</div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-content">
              {r.ms != null && Number.isFinite(r.ms) ? `${Math.round(r.ms)} ms` : "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">{r.hint}</div>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-subtle">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-elevated text-[10px] uppercase text-faint">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Feed</th>
              <th className="px-3 py-2">Backend</th>
              <th className="px-3 py-2">Render</th>
              <th className="px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().slice(0, 40).map((h, i) => (
              <tr key={`${h.frontendReceivedAt}-${i}`} className="border-t border-subtle/50">
                <td className="px-3 py-1.5 font-mono text-faint">
                  {new Date(h.frontendReceivedAt).toLocaleTimeString()}
                </td>
                <td className="px-3 py-1.5 font-mono tabular-nums">{h.price}</td>
                <td className="px-3 py-1.5 font-mono">{fmtMs(h.feedDelayMs)}</td>
                <td className="px-3 py-1.5 font-mono">{fmtMs(h.backendDelayMs)}</td>
                <td className="px-3 py-1.5 font-mono">{fmtMs(h.renderDelayMs)}</td>
                <td className="px-3 py-1.5 font-mono font-semibold">{fmtMs(h.totalDelayMs)}</td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  No ticks yet — open Chart for NIFTY or BTCUSDT.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-faint">
        India bottleneck is usually <strong>provider_feed</strong> (Yahoo/NSE REST + throttle). Crypto with Binance
        WebSocket should show near-zero backend delay and low feed delay. Angel One exchange WS is not available
        without a broker market-data license.
      </p>
    </div>
  );
}

function fmtMs(ms?: number) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${Math.round(ms)}`;
}

export default LatencyLabPage;
