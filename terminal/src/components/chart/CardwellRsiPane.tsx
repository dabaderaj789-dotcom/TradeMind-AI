/**
 * Cardwell RSI oscillator pane — 20/40/60/80 bands, fast/slow MA, PR/NR marks.
 */

import { useMemo } from "react";
import type { CardwellRsiState } from "../../lib/cardwellRsi";
import { cx } from "../../lib/format";

export function CardwellRsiPane({ state }: { state: CardwellRsiState }) {
  const plot = useMemo(() => {
    const pts = state.bars.filter((b) => b.rsi != null);
    if (pts.length < 2) return null;
    const w = 1000;
    const h = 120;
    const pad = 6;
    const x = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = (v: number) => pad + ((100 - v) / 100) * (h - pad * 2);
    const rsiPath = pts
      .map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.rsi!).toFixed(1)}`)
      .join(" ");
    const fast = pts
      .map((b, i) => (b.fastMa == null ? null : `${x(i).toFixed(1)},${y(b.fastMa).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
    const slow = pts
      .map((b, i) => (b.slowMa == null ? null : `${x(i).toFixed(1)},${y(b.slowMa).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
    const timeIndex = new Map(pts.map((b, i) => [b.openTime, i]));
    const marks = state.reversals
      .map((r) => {
        const i = timeIndex.get(r.time);
        if (i == null) return null;
        return { ...r, i };
      })
      .filter((m): m is NonNullable<typeof m> => m != null);
    return { w, h, pad, x, y, rsiPath, fast, slow, marks };
  }, [state]);

  const rsi = state.lastRsi;
  const regimeColor =
    state.regime === "BULL" ? "text-bull" : state.regime === "BEAR" ? "text-bear" : "text-muted";

  return (
    <div className="flex h-[112px] shrink-0 flex-col border-t border-subtle/50 bg-bg/80">
      <div className="flex items-center justify-between gap-2 px-2 py-0.5 text-[10px]">
        <div className="flex items-center gap-2 font-semibold uppercase tracking-wide text-faint">
          Cardwell RSI
          <span className={cx("font-mono normal-case", regimeColor)}>{state.regime}</span>
        </div>
        <div className="font-mono tabular-nums text-content">
          {rsi != null ? rsi.toFixed(1) : "—"}
          {state.lastFastMa != null && (
            <span className="ml-2 text-faint">F {state.lastFastMa.toFixed(1)}</span>
          )}
          {state.lastSlowMa != null && (
            <span className="ml-2 text-faint">S {state.lastSlowMa.toFixed(1)}</span>
          )}
        </div>
      </div>
      {plot ? (
        <svg viewBox={`0 0 ${plot.w} ${plot.h}`} className="h-full w-full px-1 pb-1" preserveAspectRatio="none">
          {[80, 60, 50, 40, 20].map((lvl) => (
            <line
              key={lvl}
              x1={plot.pad}
              x2={plot.w - plot.pad}
              y1={plot.y(lvl)}
              y2={plot.y(lvl)}
              stroke={lvl === 50 ? "rgba(148,163,184,0.35)" : lvl === 40 || lvl === 60 ? "rgba(245,158,11,0.45)" : "rgba(148,163,184,0.22)"}
              strokeDasharray={lvl === 50 ? "4 4" : undefined}
              strokeWidth={1}
            />
          ))}
          <rect
            x={plot.pad}
            y={plot.y(80)}
            width={plot.w - plot.pad * 2}
            height={plot.y(40) - plot.y(80)}
            fill={state.regime === "BULL" ? "rgba(16,185,129,0.08)" : "transparent"}
          />
          <rect
            x={plot.pad}
            y={plot.y(60)}
            width={plot.w - plot.pad * 2}
            height={plot.y(20) - plot.y(60)}
            fill={state.regime === "BEAR" ? "rgba(244,63,94,0.08)" : "transparent"}
          />
          {plot.slow && (
            <polyline points={plot.slow} fill="none" stroke="#64748b" strokeWidth="1.2" />
          )}
          {plot.fast && (
            <polyline points={plot.fast} fill="none" stroke="#38bdf8" strokeWidth="1.4" />
          )}
          <path d={plot.rsiPath} fill="none" stroke="#e2e8f0" strokeWidth="1.8" />
          {plot.marks.map((m) => (
            <g key={`${m.type}-${m.time}`}>
              <circle
                cx={plot.x(m.i)}
                cy={plot.y(m.rsi)}
                r={4}
                fill={m.type === "PR" ? "#34d399" : "#f87171"}
              />
            </g>
          ))}
        </svg>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[10px] text-muted">
          Need more bars for RSI(14)
        </div>
      )}
    </div>
  );
}
