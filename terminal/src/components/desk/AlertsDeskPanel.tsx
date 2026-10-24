/**
 * Compact alerts desk — real /alerts/* scanner status (no fake alert stream).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/apiClient";
import { cx } from "../../lib/format";

interface AlertStatus {
  enabled: boolean;
  email_configured: boolean;
  ntfy_configured?: boolean;
  ntfy_url?: string | null;
  email_to: string | null;
  interval_sec: number;
  min_confidence: number;
  tracked_count: number;
  open_count: number;
  last_scan_at: string | null;
  error?: string;
}

export function AlertsDeskPanel() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["alerts-status"],
    queryFn: ({ signal }) => apiGet<AlertStatus>("/alerts/status", signal),
    refetchInterval: 15_000,
    retry: 1,
  });

  const testEmail = useMutation({
    mutationFn: () => apiPost<{ status: string }>("/alerts/test-email", {}),
  });
  const scan = useMutation({
    mutationFn: () => apiPost<Record<string, unknown>>("/alerts/scan", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-status"] }),
  });

  const s = status.data;
  const err = status.isError;

  return (
    <div className="flex h-full flex-col overflow-auto p-3 text-[12px]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wide text-faint">Signal alerts</div>
        <span
          className={cx(
            "text-[9px] font-bold uppercase",
            err ? "text-bear" : s?.enabled ? "text-bull" : "text-faint",
          )}
        >
          {err ? "Unavailable" : s?.enabled ? "● Scanner ON" : "Scanner OFF"}
        </span>
      </div>

      {err && (
        <p className="mb-3 rounded border border-subtle bg-elevated/50 px-2 py-2 text-[11px] text-muted">
          Alerts API unavailable from current provider. Configure the backend scanner to enable email/ntfy
          signals.
        </p>
      )}

      {!err && (
        <div className="space-y-1.5 border-b border-subtle/40 pb-3">
          <Row label="Email" value={s?.email_configured ? s.email_to || "Configured" : "Not configured"} />
          <Row label="ntfy push" value={s?.ntfy_configured ? "ON" : "OFF"} />
          <Row label="Open alerts" value={s ? String(s.open_count) : "—"} />
          <Row label="Tracked" value={s ? String(s.tracked_count) : "—"} />
          <Row label="Min confidence" value={s ? String(s.min_confidence) : "—"} />
          <Row
            label="Last scan"
            value={s?.last_scan_at ? new Date(s.last_scan_at).toLocaleString() : "—"}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn-chip !text-[10px]"
          disabled={scan.isPending || err}
          onClick={() => scan.mutate()}
        >
          {scan.isPending ? "Scanning…" : "Run scan"}
        </button>
        <button
          type="button"
          className="btn-chip !text-[10px]"
          disabled={testEmail.isPending || err || !s?.email_configured}
          onClick={() => testEmail.mutate()}
        >
          Test email
        </button>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-faint">
        Price-crossing / BOS alert rules can be added when the alert engine exposes those conditions. This
        panel only shows live scanner status from the API.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-faint">{label}</span>
      <span className="truncate font-mono text-[11px] text-content">{value}</span>
    </div>
  );
}
