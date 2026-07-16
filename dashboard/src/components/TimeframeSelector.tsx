import { TIMEFRAMES, type Timeframe } from "../lib/api";

export default function TimeframeSelector({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-base-700 bg-base-850 p-0.5">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            value === tf ? "bg-brand-500 text-white" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}
