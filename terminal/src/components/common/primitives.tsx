import type { ReactNode } from "react";
import { cx, type Tone } from "../../lib/format";

// ---- Card ----------------------------------------------------------------
export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("card flex flex-col min-h-0", className)}>
      {(title || actions) && (
        <header className="card-header">
          <div className="min-w-0">
            <h2 className="card-title truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-faint mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx("p-4 flex-1 min-h-0", bodyClassName)}>{children}</div>
    </section>
  );
}

// ---- Badge ---------------------------------------------------------------
const toneBg: Record<Tone, string> = {
  bull: "bg-bull/12 text-bull",
  bear: "bg-bear/12 text-bear",
  neutral: "bg-neutral/12 text-muted",
  warn: "bg-warn/12 text-warn",
  info: "bg-info/12 text-info",
  brand: "bg-brand/15 text-brand",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("pill", toneBg[tone])}>{children}</span>;
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const c: Record<Tone, string> = {
    bull: "bg-bull",
    bear: "bg-bear",
    neutral: "bg-neutral",
    warn: "bg-warn",
    info: "bg-info",
    brand: "bg-brand",
  };
  return <span className={cx("inline-block h-2 w-2 rounded-full", c[tone])} />;
}

// ---- States --------------------------------------------------------------
export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex items-center justify-center gap-2 py-8 text-muted text-sm", className)}>
      <span className="h-4 w-4 rounded-full border-2 border-line border-t-brand animate-spin" />
      {label ?? "Loading…"}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function SkeletonLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted gap-2">
      {icon && <div className="text-faint">{icon}</div>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
      <p className="text-sm text-bear max-w-xs">{message}</p>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

// ---- Confidence ring -----------------------------------------------------
export function ConfidenceRing({ value, size = 88, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = size >= 72 ? 8 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 75 ? "rgb(var(--c-bull))" : pct >= 50 ? "rgb(var(--c-brand))" : pct >= 30 ? "rgb(var(--c-warn))" : "rgb(var(--c-bear))";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-border))" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-semibold" style={{ color, fontSize: size * 0.24 }}>
            {pct.toFixed(0)}
          </span>
        </div>
      </div>
      {label && <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>}
    </div>
  );
}

// ---- Progress ------------------------------------------------------------
export function Progress({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar: Record<Tone, string> = {
    bull: "bg-bull",
    bear: "bg-bear",
    neutral: "bg-neutral",
    warn: "bg-warn",
    info: "bg-info",
    brand: "bg-brand",
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-elevated overflow-hidden">
      <div className={cx("h-full rounded-full transition-all duration-500", bar[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---- Stat ----------------------------------------------------------------
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    bull: "text-bull",
    bear: "text-bear",
    neutral: "text-content",
    warn: "text-warn",
    info: "text-info",
    brand: "text-brand",
  };
  return (
    <div className="rounded-lg bg-elevated border border-subtle/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className={cx("text-sm font-semibold font-mono truncate", tone ? colors[tone] : "text-content")}>{value}</div>
    </div>
  );
}
