import type { ReactNode } from "react";

export function Card({
  title,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <h2 className="card-title">{title}</h2>
          {actions}
        </header>
      )}
      <div className={`p-4 flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

type Tone = "bull" | "bear" | "neutral" | "brand" | "warn";

const toneClasses: Record<Tone, string> = {
  bull: "bg-bull/15 text-bull",
  bear: "bg-bear/15 text-bear",
  neutral: "bg-base-700 text-slate-300",
  brand: "bg-brand-500/15 text-brand-400",
  warn: "bg-amber-500/15 text-amber-400",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${toneClasses[tone]}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
      <span className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-brand-400 animate-spin" />
      {label ?? "Loading…"}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  const color = tone ? toneClasses[tone].split(" ").pop() : "text-slate-100";
  return (
    <div className="rounded-lg bg-base-850 border border-base-800 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-semibold font-mono ${color}`}>{value}</div>
    </div>
  );
}

export function ProgressBar({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar: Record<Tone, string> = {
    bull: "bg-bull",
    bear: "bg-bear",
    neutral: "bg-slate-500",
    brand: "bg-brand-500",
    warn: "bg-amber-500",
  };
  return (
    <div className="h-2 w-full rounded-full bg-base-800 overflow-hidden">
      <div className={`h-full rounded-full ${bar[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
