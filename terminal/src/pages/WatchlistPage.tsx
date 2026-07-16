import { Link } from "react-router-dom";
import { SymbolRow } from "../components/sidebar/SymbolRow";
import { TopBarActions } from "../components/layout/TopBarActions";
import { usePrefs } from "../store/prefs";

export function WatchlistPage() {
  const watchlist = usePrefs((s) => s.watchlist);
  const favorites = usePrefs((s) => s.favorites);
  const removeWatch = usePrefs((s) => s.removeWatch);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-subtle/60 bg-surface/90 px-4 backdrop-blur-md">
        <div>
          <h1 className="text-base font-semibold text-content tracking-tight">Watchlist</h1>
          <p className="text-[11px] text-faint">Symbols you follow for quick chart access</p>
        </div>
        <TopBarActions />
      </header>

      <div className="space-y-5 overflow-auto p-4 pb-24 lg:pb-8">
        {watchlist.length === 0 ? (
          <div className="rounded-xl border border-subtle/60 bg-surface p-6 text-center">
            <div className="text-sm font-medium text-content">Watchlist empty</div>
            <p className="mt-1 text-xs text-muted">Open Markets or a chart and add symbols you want to revisit.</p>
            <Link to="/markets" className="btn-primary mt-4 inline-flex text-sm">
              Browse markets
            </Link>
          </div>
        ) : (
          <section>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Watching · {watchlist.length}
            </div>
            <div className="space-y-0.5 rounded-xl border border-subtle/60 bg-surface p-2">
              {watchlist.map((s) => (
                <SymbolRow key={s.id} symbol={s} onRemove={removeWatch} />
              ))}
            </div>
          </section>
        )}

        {favorites.length > 0 && (
          <section>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Favorites · {favorites.length}
            </div>
            <div className="space-y-0.5 rounded-xl border border-subtle/60 bg-surface p-2">
              {favorites.map((s) => (
                <SymbolRow key={s.id} symbol={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
