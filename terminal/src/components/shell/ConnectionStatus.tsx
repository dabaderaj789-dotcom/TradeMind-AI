import { connectionLabel, resolveProvider, type ConnectionStatus } from "../../lib/stream/providers";
import { useConnection } from "../../store/connection";
import { usePrefs } from "../../store/prefs";
import { cx } from "../../lib/format";

const DOT: Record<ConnectionStatus, string> = {
  live: "bg-bull shadow-[0_0_8px_rgba(34,197,94,0.55)]",
  connecting: "bg-warn animate-pulse",
  disconnected: "bg-bear",
};

const LABEL: Record<ConnectionStatus, string> = {
  live: "text-bull",
  connecting: "text-warn",
  disconnected: "text-bear",
};

export function ConnectionStatusChip({ compact = false }: { compact?: boolean }) {
  const status = useConnection((s) => s.status);
  const market = usePrefs((s) => s.marketCategory);
  const provider = resolveProvider(market);

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-subtle/70 bg-elevated/80 px-2 py-0.5"
      title={`${connectionLabel(status)} · ${provider.label}`}
      role="status"
      aria-live="polite"
    >
      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", DOT[status])} />
      <span className={cx("text-[10px] font-semibold uppercase tracking-wide", LABEL[status])}>
        {connectionLabel(status)}
      </span>
      {!compact && (
        <span className="hidden text-[9px] text-faint sm:inline">· {provider.shortLabel}</span>
      )}
    </div>
  );
}
