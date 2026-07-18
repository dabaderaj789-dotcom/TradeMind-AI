import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useUniverseSymbols } from "../../hooks/useUniverseSymbols";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { usePrefs } from "../../store/prefs";
import { UniverseWatchRow } from "../markets/UniverseQuoteRow";

/** Desktop left rail — Angel One–style always-on watchlist of the 4 symbols. */
export function WatchlistDrawer() {
  const { symbolId } = useParams();
  const { items, ready, isLoading } = useUniverseSymbols();
  const select = useSelectSymbol();
  const addWatch = usePrefs((s) => s.addWatch);
  const watchlist = usePrefs((s) => s.watchlist);

  // Keep prefs watchlist synced to universe for Chart deep-links / mobile.
  useEffect(() => {
    for (const u of ready) {
      if (u.lite && !watchlist.some((w) => w.id === u.lite!.id)) {
        addWatch(u.lite);
      }
    }
  }, [ready, addWatch, watchlist]);

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-subtle/40 bg-surface/95">
      <div className="flex h-11 items-center border-b border-subtle/30 px-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">Watchlist</div>
          <div className="text-sm font-semibold text-content">Markets</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {isLoading && <p className="px-2 py-4 text-xs text-faint">Loading…</p>}
        {items.map((u) => (
          <UniverseWatchRow
            key={u.code}
            item={u}
            active={!!u.lite && u.lite.id === symbolId}
            onOpen={() => {
              if (u.lite) select(u.lite);
            }}
          />
        ))}
      </div>
    </aside>
  );
}
