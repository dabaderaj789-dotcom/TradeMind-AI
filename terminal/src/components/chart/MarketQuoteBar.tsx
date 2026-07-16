import type { MarketQuote } from "../../lib/types";
import { cx, fmtCompact, fmtPrice, fmtRelative, fmtSignedPct, fmtTime } from "../../lib/format";
import { Badge, Skeleton } from "../common/primitives";

export function MarketQuoteBar({
  quote,
  loading,
  compact = false,
}: {
  quote: MarketQuote | null | undefined;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <section className="border-b border-subtle/50 bg-surface/60 px-3 py-2 lg:px-4">
        <Skeleton className="h-10" />
      </section>
    );
  }

  if (!quote) return null;

  const up = quote.day_change_pct >= 0;
  const statusTone = quote.market_status === "OPEN" ? "bull" : "neutral";

  if (compact) {
    return (
      <section className="border-b border-subtle/50 bg-surface/60 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-semibold tabular-nums text-content">
              {fmtPrice(quote.current_price)}
            </span>
            <span className={cx("font-mono text-xs tabular-nums", up ? "text-bull" : "text-bear")}>
              {fmtSignedPct(quote.day_change_pct)}
            </span>
          </div>
          <Badge tone={statusTone}>{quote.market_status}</Badge>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-subtle/50 bg-surface/70 backdrop-blur-sm">
      <div className="px-3 py-2.5 lg:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Last</div>
              <div className="font-mono text-xl font-semibold tabular-nums text-content">
                {fmtPrice(quote.current_price)}
              </div>
            </div>
            <QuoteStat label="Change" value={fmtSignedPct(quote.day_change_pct)} tone={up ? "bull" : "bear"} />
            <QuoteStat label="Chg $" value={`${quote.day_change >= 0 ? "+" : ""}${fmtPrice(quote.day_change)}`} tone={up ? "bull" : "bear"} />
            <QuoteStat label="Open" value={fmtPrice(quote.day_open)} />
            <QuoteStat label="High" value={fmtPrice(quote.day_high)} tone="bull" />
            <QuoteStat label="Low" value={fmtPrice(quote.day_low)} tone="bear" />
            <QuoteStat label="Prev close" value={fmtPrice(quote.prev_close)} />
            <QuoteStat label="Range" value={fmtPrice(quote.day_range)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone}>{quote.market_status}</Badge>
            <span className="text-[10px] text-faint">{quote.provider}</span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-subtle/40 pt-2 text-[10px]">
          <span className="text-faint">
            Vol <span className="font-mono text-content">{fmtCompact(quote.volume)}</span>
          </span>
          <span className="text-faint">
            Avg vol <span className="font-mono text-content">{fmtCompact(quote.avg_volume)}</span>
          </span>
          <span className="text-faint">
            VWAP <span className="font-mono text-content">{fmtPrice(quote.vwap)}</span>
          </span>
          <span className="text-faint">
            Prev H <span className="font-mono text-content">{fmtPrice(quote.prev_day_high)}</span>
          </span>
          <span className="text-faint">
            Prev L <span className="font-mono text-content">{fmtPrice(quote.prev_day_low)}</span>
          </span>
          <span className="text-faint ml-auto">
            Updated <span className="text-content">{fmtTime(quote.last_updated)}</span>
            <span className="mx-1">·</span>
            {fmtRelative(quote.last_updated)}
          </span>
        </div>
      </div>
    </section>
  );
}

function QuoteStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</div>
      <div
        className={cx(
          "font-mono text-sm font-medium tabular-nums",
          tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-content",
        )}
      >
        {value}
      </div>
    </div>
  );
}
