import { MARKETS, type MarketId } from "../../lib/markets";
import { cx } from "../../lib/format";
import { usePrefs } from "../../store/prefs";

/** Compact top-level market chips — Scanner scope only (not the Markets browser). */
export function MarketPills({ className }: { className?: string }) {
  const marketCategory = usePrefs((s) => s.marketCategory);
  const setMarketCategory = usePrefs((s) => s.setMarketCategory);

  return (
    <div className={cx("flex flex-wrap gap-1.5", className)} role="tablist" aria-label="Scanner market">
      {MARKETS.map((m) => {
        const active = marketCategory === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={m.hint}
            onClick={() => setMarketCategory(m.id as MarketId)}
            className={cx(
              "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors min-h-[36px]",
              active
                ? "bg-brand text-white"
                : "border border-subtle/70 bg-elevated text-muted hover:text-content",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
