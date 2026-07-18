import { TopBarActions } from "../components/layout/TopBarActions";
import { Spinner } from "../components/common/primitives";
import { useUniverseSymbols } from "../hooks/useUniverseSymbols";
import { useSelectSymbol } from "../hooks/useSelectSymbol";
import { UniverseQuoteRow } from "../components/markets/UniverseQuoteRow";

export function WatchlistPage() {
  const { items, isLoading } = useUniverseSymbols();
  const select = useSelectSymbol();

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-subtle/40 bg-surface/90 px-4">
        <div>
          <h1 className="font-display text-base font-semibold tracking-tight text-content">Watchlist</h1>
          <p className="text-[11px] text-faint">Your four markets</p>
        </div>
        <TopBarActions />
      </header>

      <div className="min-h-0 flex-1 overflow-auto pb-24 lg:pb-0">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner label="Loading…" />
          </div>
        ) : (
          <ul className="divide-y divide-subtle/30">
            {items.map((u) => (
              <li key={u.code}>
                <UniverseQuoteRow
                  item={u}
                  onOpen={() => {
                    if (u.lite) select(u.lite);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
