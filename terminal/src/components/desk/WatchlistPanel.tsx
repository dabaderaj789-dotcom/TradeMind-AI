/**
 * Professional multi-watchlist panel — live LTP via existing quote rows.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { UniverseWatchRow } from "../markets/UniverseQuoteRow";
import { useUniverseSymbols } from "../../hooks/useUniverseSymbols";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { usePrefs } from "../../store/prefs";
import { cx } from "../../lib/format";
import type { SymbolLite } from "../../lib/types";

type SortKey = "symbol" | "change";

export function WatchlistPanel({ activeSymbolId }: { activeSymbolId: string }) {
  const { items, ready, isLoading } = useUniverseSymbols();
  const select = useSelectSymbol();
  const books = usePrefs((s) => s.watchlistBooks);
  const activeId = usePrefs((s) => s.activeWatchlistId);
  const setActive = usePrefs((s) => s.setActiveWatchlist);
  const watchlist = usePrefs((s) => s.watchlist);
  const addWatch = usePrefs((s) => s.addWatch);
  const removeWatch = usePrefs((s) => s.removeWatch);
  const createWatchlist = usePrefs((s) => s.createWatchlist);
  const catalog = usePrefs((s) => s.symbolCatalog);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("symbol");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const seeded = useRef(false);

  // Seed My Markets from universe once when empty
  useEffect(() => {
    if (seeded.current) return;
    const my = books.find((b) => b.id === "my-markets");
    if (my && my.symbolIds.length === 0 && ready.length) {
      seeded.current = true;
      for (const u of ready) {
        if (u.lite) addWatch(u.lite);
      }
    }
  }, [books, ready, addWatch]);

  const rows = useMemo(() => {
    const fromBook: SymbolLite[] =
      watchlist.length > 0
        ? watchlist
        : ready.map((u) => u.lite!).filter(Boolean);

    const filtered = fromBook.filter((s) => {
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return (
        s.symbol_code.toLowerCase().includes(needle) ||
        (s.name ?? "").toLowerCase().includes(needle)
      );
    });

    if (sort === "symbol") {
      return [...filtered].sort((a, b) => a.symbol_code.localeCompare(b.symbol_code));
    }
    return filtered;
  }, [watchlist, ready, q, sort]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-subtle/40 px-1.5 py-1">
        {books.map((b) => (
          <button
            key={b.id}
            type="button"
            className={cx(
              "shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              activeId === b.id ? "bg-brand/12 text-brand" : "text-faint hover:text-content",
            )}
            onClick={() => setActive(b.id)}
          >
            {b.name}
          </button>
        ))}
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-[10px] font-bold text-faint hover:text-brand"
          title="New watchlist"
          onClick={() => setCreating(true)}
        >
          +
        </button>
      </div>

      {creating && (
        <div className="flex gap-1 border-b border-subtle/40 px-2 py-1.5">
          <input
            className="min-w-0 flex-1 rounded border border-subtle bg-elevated px-2 py-1 text-[11px]"
            placeholder="Watchlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="btn-chip !text-[10px]"
            onClick={() => {
              if (newName.trim()) createWatchlist(newName.trim());
              setNewName("");
              setCreating(false);
            }}
          >
            Add
          </button>
          <button
            type="button"
            className="btn-chip !text-[10px]"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1 border-b border-subtle/30 px-2 py-1.5">
        <input
          className="min-w-0 flex-1 rounded border border-subtle bg-elevated px-2 py-1 text-[11px]"
          placeholder="Search list…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={cx("btn-chip !text-[10px]", sort === "symbol" && "btn-chip-active")}
          onClick={() => setSort("symbol")}
        >
          A–Z
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {isLoading && <p className="px-2 py-4 text-xs text-faint">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-faint">
            Empty list — open Search and add symbols.
          </p>
        )}
        {rows.map((s) => {
          const u = items.find((i) => i.lite?.id === s.id);
          if (u) {
            return (
              <div key={s.id} className="group relative">
                <UniverseWatchRow
                  item={u}
                  active={s.id === activeSymbolId}
                  onOpen={() => select(s)}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded bg-elevated px-1.5 py-0.5 text-[9px] font-bold text-faint group-hover:block hover:text-bear"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWatch(s.id);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          }
          const lite = catalog[s.id] ?? s;
          return (
            <button
              key={s.id}
              type="button"
              className={cx(
                "flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-elevated",
                s.id === activeSymbolId && "bg-brand/8",
              )}
              onClick={() => select(lite)}
            >
              <span className="font-mono text-[11px] font-semibold">{lite.symbol_code}</span>
              <span className="text-[9px] uppercase text-faint">{lite.exchange_code}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
