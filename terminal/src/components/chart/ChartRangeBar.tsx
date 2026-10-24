import { useEffect, useState } from "react";
import { cx } from "../../lib/format";

const RANGES: { id: string; label: string; bars: number }[] = [
  { id: "1D", label: "1D", bars: 96 },
  { id: "5D", label: "5D", bars: 480 },
  { id: "1M", label: "1M", bars: 1200 },
  { id: "3M", label: "3M", bars: 2400 },
  { id: "ALL", label: "ALL", bars: 0 },
];

function applyRange(bars: number) {
  if (bars === 0) {
    window.dispatchEvent(new CustomEvent("trademind:fit-chart"));
  } else {
    window.dispatchEvent(new CustomEvent("trademind:visible-bars", { detail: { bars } }));
  }
}

/** Bottom chart range strip — defaults to 1D (TradingView-like recent view). */
export function ChartRangeBar() {
  const [active, setActive] = useState("1D");

  // On mount, zoom to 1D so axis shows dense HH:MM like TradingView — not ALL history
  useEffect(() => {
    const t = window.setTimeout(() => applyRange(96), 120);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="hidden h-9 shrink-0 items-center gap-1 border-t border-subtle bg-surface px-3 lg:flex">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => {
            setActive(r.id);
            applyRange(r.bars);
          }}
          className={cx(
            "rounded px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors",
            active === r.id
              ? "bg-brand/15 text-brand"
              : "text-muted hover:bg-elevated hover:text-content",
          )}
        >
          {r.label}
        </button>
      ))}
      <div className="flex-1" />
      <span className="font-mono text-[10px] font-semibold tabular-nums text-muted">
        Axis IST · {new Date().toLocaleTimeString("en-IN", { hour12: false })}
      </span>
    </div>
  );
}
