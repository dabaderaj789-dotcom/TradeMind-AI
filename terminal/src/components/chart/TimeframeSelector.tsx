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
    <div className={cx("inline-flex max-w-full overflow-x-auto", compact && "scrollbar-none")}>
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          type="button"
          onClick={() => onChange(tf)}
          className={cx(
            "shrink-0 font-medium tracking-wide transition-all duration-200 ease-terminal",
            compact ? "rounded px-1.5 py-1 text-[10px]" : "rounded-md px-2.5 py-1.5 text-[11px]",
            value === tf
              ? "bg-elevated text-content shadow-[inset_0_-1px_0_0_rgb(var(--c-brand))]"
              : "text-faint hover:bg-elevated/50 hover:text-muted",
          )}
        >
          {TIMEFRAME_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
