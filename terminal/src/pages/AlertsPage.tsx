/**
 * Email signal alerts — works without watching the chart / without Angel.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/apiClient";

interface AlertStatus {
  enabled: boolean;
  email_configured: boolean;
  ntfy_configured?: boolean;
  ntfy_topic?: string | null;
  ntfy_url?: string | null;
  email_to: string | null;
  watchlist: { symbol_code: string; timeframe: string }[];
  interval_sec: number;
  min_confidence: number;
  tracked_count: number;
  open_count: number;
  last_scan_at: string | null;
  last_scan_summary: Record<string, unknown>;
  error?: string;
}

export function AlertsPage() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["alerts-status"],
    queryFn: ({ signal }) => apiGet<AlertStatus>("/alerts/status", signal),
    refetchInterval: 15_000,
  });

  const testEmail = useMutation({
    mutationFn: () =>
      apiPost<{ status: string; to: string; ntfy_url?: string; ntfy?: string; email?: string }>(
        "/alerts/test-email",
        {},
      ),
  });
  const scan = useMutation({
    mutationFn: () => apiPost<Record<string, unknown>>("/alerts/scan", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-status"] }),
  });

  const s = status.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 lg:p-6">
      <header>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Personal alerts</div>
        <h1 className="font-display text-xl font-bold">Email signals</h1>
        <p className="mt-1 text-sm text-muted">
          TradeMind emails entry, stop loss, and targets when a setup fires — even if the chart is closed.
          No Angel required.
        </p>
      </header>

      <section className="rounded-xl border border-subtle bg-surface p-4 text-sm space-y-2">
        <Row label="Scanner" value={s?.enabled ? "ON" : "OFF"} ok={!!s?.enabled} />
        <Row label="Phone push (ntfy)" value={s?.ntfy_configured ? "ON" : "OFF"} ok={!!s?.ntfy_configured} />
        <Row label="Email SMTP" value={s?.email_configured ? "Configured" : "Optional"} ok={!!s?.email_configured} />
        <Row label="Email to" value={s?.email_to || "—"} />
        {s?.ntfy_url && (
          <div className="pt-2 text-xs">
            <div className="text-faint mb-1">Subscribe on phone (ntfy app)</div>
            <a className="text-brand break-all underline" href={s.ntfy_url} target="_blank" rel="noreferrer">
              {s.ntfy_url}
            </a>
          </div>
        )}
        <Row label="Interval" value={s ? `${s.interval_sec}s` : "—"} />
        <Row label="Min confidence" value={s ? String(s.min_confidence) : "—"} />
        <Row label="Open alerts" value={s ? String(s.open_count) : "—"} />
        <Row label="Tracked" value={s ? String(s.tracked_count) : "—"} />
        <Row
          label="Last scan"
          value={s?.last_scan_at ? new Date(s.last_scan_at).toLocaleString() : "—"}
        />
      </section>

      <section className="rounded-xl border border-subtle bg-surface p-4 text-sm">
        <div className="text-[10px] font-bold uppercase text-faint mb-2">Watchlist</div>
        <ul className="space-y-1">
          {(s?.watchlist ?? []).map((w) => (
            <li key={`${w.symbol_code}-${w.timeframe}`} className="font-mono">
              {w.symbol_code} · {w.timeframe}
            </li>
          ))}
          {!s?.watchlist?.length && <li className="text-muted">None</li>}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-chip btn-chip-active"
          disabled={testEmail.isPending}
          onClick={() => testEmail.mutate()}
        >
          {testEmail.isPending ? "Sending…" : "Send test email"}
        </button>
        <button
          type="button"
          className="btn-chip"
          disabled={scan.isPending}
          onClick={() => scan.mutate()}
        >
          {scan.isPending ? "Scanning…" : "Scan now"}
        </button>
      </div>

      {(testEmail.isError || scan.isError) && (
        <p className="text-xs text-bear">
          {(testEmail.error as Error)?.message || (scan.error as Error)?.message}
        </p>
      )}
      {testEmail.isSuccess && (
        <p className="text-xs text-bull">
          Test sent
          {testEmail.data.ntfy === "sent" ? " · ntfy push OK" : ""}
          {testEmail.data.email === "sent" ? ` · email → ${testEmail.data.to}` : ""}
        </p>
      )}
      {scan.isSuccess && (
        <pre className="overflow-auto rounded-lg bg-elevated p-3 text-[11px] text-muted">
          {JSON.stringify(scan.data, null, 2)}
        </pre>
      )}

      <section className="rounded-xl border border-subtle bg-surface p-4 text-xs text-muted space-y-2">
        <p className="font-semibold text-content">Railway / .env setup</p>
        <pre className="overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
{`ALERTS_ENABLED=true
ALERT_EMAIL_TO=you@gmail.com
ALERT_WATCHLIST=NIFTY50:5m,BANKNIFTY:5m
ALERT_INTERVAL_SEC=180
ALERT_MIN_CONFIDENCE=60

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=TradeMind <you@gmail.com>
SMTP_USE_TLS=true`}
        </pre>
        <p>
          Gmail: use an{" "}
          <a
            className="text-brand underline"
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noreferrer"
          >
            App Password
          </a>
          , not your normal password. Redeploy API after setting vars.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-faint">{label}</span>
      <span className={ok === false ? "text-bear" : ok ? "text-bull" : "text-content"}>{value}</span>
    </div>
  );
}

export default AlertsPage;
