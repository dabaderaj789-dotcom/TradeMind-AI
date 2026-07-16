import { TIMEFRAMES, type Timeframe } from "../../lib/endpoints";
import { cx } from "../../lib/format";

export function TimeframeSelector({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-subtle/70 bg-elevated p-0.5">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={cx(
            "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
            value === tf ? "bg-brand text-white" : "text-muted hover:text-content",
          )}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}
