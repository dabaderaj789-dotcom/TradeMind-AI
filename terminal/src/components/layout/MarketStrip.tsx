/**
 * Live market strip — only instruments present in the universe (no invented indices).
 */

import { useUniverseSymbols } from "../../hooks/useUniverseSymbols";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { useMarketQuote } from "../../hooks/queries";
import { cx, fmtPrice, fmtSignedPct } from "../../lib/format";
import { useWorkspace } from "../../store/workspace";

const STRIP_CODES = ["NIFTY50", "BANKNIFTY", "SENSEX", "BTCUSDT", "XAUUSD"] as const;

function labelFor(code: string) {
  if (code === "NIFTY50") return "NIFTY";
  if (code === "XAUUSD") return "GOLD";
  if (code === "BTCUSDT") return "BTC";
  return code;
}

export function MarketStrip({ activeCode }: { activeCode?: string }) {
  const { items } = useUniverseSymbols();
  const select = useSelectSymbol();
  const openDesk = useWorkspace((s) => s.openDeskWorkspace);

  const entries = STRIP_CODES.map((code) => items.find((i) => i.code === code)).filter(Boolean);

  return (
    <div className="market-strip hidden lg:flex">
      <div className="flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto">
        {entries.map((u) => {
          if (!u?.lite) return null;
          const label = labelFor(u.code);
          const active =
            !!activeCode &&
            (u.display === activeCode ||
              u.code === activeCode ||
              (u.code === "NIFTY50" && activeCode === "NIFTY") ||
              (u.code === "XAUUSD" && activeCode === "GOLD"));
          return (
            <StripChip
              key={u.code}
              label={label}
              symbolId={u.lite.id}
              active={active}
              onPick={() => {
                select(u.lite!);
                openDesk("chart");
              }}
            />
          );
        })}
      </div>
      <LiveClock />
    </div>
  );
}

function StripChip({
  label,
  symbolId,
  active,
  onPick,
}: {
  label: string;
  symbolId: string;
  active: boolean;
  onPick: () => void;
}) {
  const quote = useMarketQuote(symbolId);
  const px = quote.data?.current_price;
  const chg = quote.data?.day_change_pct ?? 0;
  const abs = quote.data?.day_change;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cx("market-strip-chip", active && "market-strip-chip-active")}
    >
      <div className="text-[10px] font-bold tracking-wide text-content">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5 font-mono tabular-nums">
        <span className="text-[12px] font-semibold text-content">{px != null ? fmtPrice(px) : "—"}</span>
        {abs != null && (
          <span className={cx("text-[10px]", chg >= 0 ? "text-bull" : "text-bear")}>
            {abs >= 0 ? "+" : ""}
            {fmtPrice(abs)}
          </span>
        )}
        <span className={cx("text-[10px] font-semibold", chg >= 0 ? "text-bull" : "text-bear")}>
          {fmtSignedPct(chg)}
        </span>
      </div>
    </button>
  );
}

function LiveClock() {
  // Connection / freshness live in DeskHeader + DeskStatusBar — do not fake LIVE here.
  return (
    <div className="flex shrink-0 items-center gap-2 border-l border-subtle px-3 text-[10px] text-faint">
      <span className="font-mono tabular-nums">IST</span>
    </div>
  );
}
