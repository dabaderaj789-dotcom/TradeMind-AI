/**
 * Terminal V2 — collapsible watchlist / favorites / recents drawer.
 * Uses existing prefs store; no backend changes.
 */

import { useNavigate } from "react-router-dom";
import { SidebarSearch } from "../sidebar/SidebarSearch";
import { SymbolRow } from "../sidebar/SymbolRow";
import { usePrefs } from "../../store/prefs";
import { useWorkspace } from "../../store/workspace";

export function WatchlistDrawer() {
  const navigate = useNavigate();
  const watchlist = usePrefs((s) => s.watchlist);
  const favorites = usePrefs((s) => s.favorites);
  const recents = usePrefs((s) => s.recents);
  const removeWatch = usePrefs((s) => s.removeWatch);
  const setWatchlistOpen = useWorkspace((s) => s.setWatchlistOpen);

  return (
    <aside className="v2-drawer flex h-full w-[260px] shrink-0 flex-col animate-slide-in-left">
      <div className="flex h-12 items-center justify-between border-b border-subtle/30 px-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Lists</div>
          <div className="text-sm font-medium text-content">Watchlist</div>
        </div>
        <button type="button" className="btn-chip" onClick={() => setWatchlistOpen(false)} title="Close">
          ✕
        </button>
      </div>

      <div className="border-b border-subtle/20 px-3 py-3">
        <SidebarSearch />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto px-3 py-4">
        <Section title="Watchlist" count={watchlist.length}>
          {watchlist.length === 0 ? (
            <p className="px-1 text-xs leading-relaxed text-faint">
              Search above or open Markets to pin symbols.
            </p>
          ) : (
            <div className="space-y-0.5">
              {watchlist.map((s) => (
                <SymbolRow key={s.id} symbol={s} onRemove={removeWatch} />
              ))}
            </div>
          )}
        </Section>

        {favorites.length > 0 && (
          <Section title="Favorites" count={favorites.length}>
            <div className="space-y-0.5">
              {favorites.map((s) => (
                <SymbolRow key={s.id} symbol={s} />
              ))}
            </div>
          </Section>
        )}

        {recents.length > 0 && (
          <Section title="Recent" count={recents.length}>
            <div className="space-y-0.5">
              {recents.map((s) => (
                <SymbolRow key={s.id} symbol={s} />
              ))}
            </div>
          </Section>
        )}
      </div>

      <div className="border-t border-subtle/30 p-3">
        <button type="button" className="btn-ghost w-full text-xs" onClick={() => navigate("/markets")}>
          Browse all markets
        </button>
      </div>
    </aside>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{title}</span>
        <span className="font-mono text-[10px] text-faint">{count}</span>
      </div>
      {children}
    </div>
  );
}
