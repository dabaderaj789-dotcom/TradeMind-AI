import { num } from "../lib/format";

export default function ConfidenceScore({
  value,
  size = 96,
  label = "Confidence",
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, num(value)));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 75 ? "#22c55e" : pct >= 50 ? "#3b6cff" : pct >= 30 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e2740" strokeWidth={stroke} />
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
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold font-mono" style={{ color }}>
            {pct.toFixed(0)}
          </span>
          <span className="text-[10px] text-slate-500">/ 100</span>
        </div>
      </div>
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}
