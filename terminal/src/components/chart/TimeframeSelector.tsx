import { TIMEFRAME_LABELS, TIMEFRAMES, type Timeframe } from "../../lib/endpoints";
import { cx } from "../../lib/format";

export function TimeframeSelector({
  value,
  onChange,
  compact = false,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        "inline-flex max-w-full overflow-x-auto rounded-md border border-subtle/40 bg-elevated/80 p-0.5",
        compact && "scrollbar-none",
      )}
    >
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          type="button"
          onClick={() => onChange(tf)}
          className={cx(
            "shrink-0 font-medium transition-colors",
            compact ? "px-1.5 py-0.5 text-[10px] rounded" : "px-2 py-1 text-xs rounded-md",
            value === tf ? "bg-brand text-white" : "text-muted hover:text-content",
          )}
        >
          {TIMEFRAME_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
