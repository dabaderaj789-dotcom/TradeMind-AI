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
            "shrink-0 border-b-2 px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors",
            value === tf
              ? "border-brand text-brand"
              : "border-transparent text-faint hover:text-content",
          )}
        >
          {TIMEFRAME_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
