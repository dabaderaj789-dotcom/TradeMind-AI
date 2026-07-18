import { PRIMARY_TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe } from "../../lib/endpoints";
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
    <div className={cx("inline-flex items-center gap-0.5", compact && "scrollbar-none")}>
      {PRIMARY_TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          type="button"
          onClick={() => onChange(tf)}
          className={cx(
            "shrink-0 font-semibold tracking-wide transition-all duration-150",
            compact ? "rounded px-2.5 py-1 text-[11px]" : "rounded-md px-3.5 py-1.5 text-xs",
            value === tf
              ? "bg-brand/15 text-brand ring-1 ring-brand/35"
              : "text-faint hover:bg-elevated hover:text-content",
          )}
        >
          {TIMEFRAME_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
