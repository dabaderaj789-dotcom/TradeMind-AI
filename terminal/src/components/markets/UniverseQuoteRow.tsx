import { useMarketQuote } from "../../hooks/queries";
import { cx, fmtPrice, fmtSignedPct } from "../../lib/format";
import { displayCode } from "../../lib/universe";
import type { UniverseSymbol } from "../../hooks/useUniverseSymbols";

export function UniverseQuoteRow({
  item,
  onOpen,
  compact = false,
}: {
  item: UniverseSymbol;
  onOpen: () => void;
  compact?: boolean;
}) {
  const quote = useMarketQuote(item.lite?.id ?? null);
  const q = quote.data;
  const change = q?.day_change_pct ?? 0;
  const up = change >= 0;
  const disabled = !item.lite;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className={cx(
        "flex w-full items-center gap-3 text-left transition-colors",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
        disabled ? "opacity-50" : "hover:bg-elevated/80 active:bg-elevated",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cx("font-semibold tracking-tight text-content", compact ? "text-sm" : "text-[15px]")}>
            {item.display}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-faint">
            {item.exchange === "binance" ? "CRYPTO" : "INDIA"}
          </span>
        </div>
        {!compact && <div className="mt-0.5 truncate text-xs text-muted">{item.name}</div>}
        {disabled && <div className="mt-0.5 text-[10px] text-warn">Unavailable</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className={cx("font-mono tabular-nums text-content", compact ? "text-sm" : "text-[15px]")}>
          {q ? fmtPrice(q.current_price) : "—"}
        </div>
        <div className={cx("font-mono text-[11px] tabular-nums", up ? "text-bull" : "text-bear")}>
          {q ? fmtSignedPct(change) : "—"}
        </div>
      </div>
    </button>
  );
}

/** Compact row for desktop watchlist strip. */
export function UniverseWatchRow({
  item,
  active,
  onOpen,
}: {
  item: UniverseSymbol;
  active?: boolean;
  onOpen: () => void;
}) {
  const quote = useMarketQuote(item.lite?.id ?? null);
  const q = quote.data;
  const change = q?.day_change_pct ?? 0;
  const up = change >= 0;

  return (
    <button
      type="button"
      disabled={!item.lite}
      onClick={onOpen}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
        active ? "bg-brand/12 ring-1 ring-brand/30" : "hover:bg-elevated",
        !item.lite && "opacity-40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-content">{displayCode(item.code)}</div>
        <div className={cx("font-mono text-[10px] tabular-nums", up ? "text-bull" : "text-bear")}>
          {q ? fmtSignedPct(change) : "—"}
        </div>
      </div>
      <div className="font-mono text-[12px] tabular-nums text-content">
        {q ? fmtPrice(q.current_price) : "—"}
      </div>
    </button>
  );
}
