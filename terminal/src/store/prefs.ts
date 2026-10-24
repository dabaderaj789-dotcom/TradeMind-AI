/**
 * Multi-watchlist store — professional desk lists without page reload.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MarketId } from "../lib/markets";
import type { SymbolLite } from "../lib/types";

const RECENT_LIMIT = 10;

export interface WatchlistBook {
  id: string;
  name: string;
  symbolIds: string[];
}

function uid() {
  return `wl_${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_BOOKS: WatchlistBook[] = [
  { id: "my-markets", name: "My Markets", symbolIds: [] },
  { id: "nifty", name: "NIFTY", symbolIds: [] },
  { id: "banknifty", name: "BANKNIFTY", symbolIds: [] },
  { id: "sensex", name: "SENSEX", symbolIds: [] },
  { id: "crypto", name: "BTCUSDT", symbolIds: [] },
  { id: "expiry", name: "Expiry", symbolIds: [] },
];

interface PrefsState {
  marketCategory: MarketId;
  /** @deprecated Kept for migration — exchange_code filter. */
  market: string;
  /** Flat watchlist kept in sync with active book for legacy callers. */
  watchlist: SymbolLite[];
  favorites: SymbolLite[];
  recents: SymbolLite[];
  watchlistBooks: WatchlistBook[];
  activeWatchlistId: string;
  /** Symbol catalog keyed by id for book membership resolution. */
  symbolCatalog: Record<string, SymbolLite>;
  setMarketCategory: (id: MarketId) => void;
  setMarket: (code: string) => void;
  addWatch: (s: SymbolLite) => void;
  removeWatch: (id: string) => void;
  isWatched: (id: string) => boolean;
  reorderWatch: (from: number, to: number) => void;
  setActiveWatchlist: (id: string) => void;
  createWatchlist: (name: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  toggleFavorite: (s: SymbolLite) => void;
  isFavorite: (id: string) => boolean;
  pushRecent: (s: SymbolLite) => void;
}

function syncFlat(books: WatchlistBook[], activeId: string, catalog: Record<string, SymbolLite>): SymbolLite[] {
  const book = books.find((b) => b.id === activeId) ?? books[0];
  if (!book) return [];
  return book.symbolIds.map((id) => catalog[id]).filter(Boolean) as SymbolLite[];
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      marketCategory: "crypto",
      market: "",
      watchlist: [],
      favorites: [],
      recents: [],
      watchlistBooks: DEFAULT_BOOKS,
      activeWatchlistId: "my-markets",
      symbolCatalog: {},
      setMarketCategory: (id) => set({ marketCategory: id }),
      setMarket: (code) => set({ market: code }),
      addWatch: (s) =>
        set((st) => {
          const catalog = { ...st.symbolCatalog, [s.id]: s };
          const books = st.watchlistBooks.map((b) =>
            b.id === st.activeWatchlistId && !b.symbolIds.includes(s.id)
              ? { ...b, symbolIds: [...b.symbolIds, s.id] }
              : b,
          );
          return {
            symbolCatalog: catalog,
            watchlistBooks: books,
            watchlist: syncFlat(books, st.activeWatchlistId, catalog),
          };
        }),
      removeWatch: (id) =>
        set((st) => {
          const books = st.watchlistBooks.map((b) =>
            b.id === st.activeWatchlistId
              ? { ...b, symbolIds: b.symbolIds.filter((x) => x !== id) }
              : b,
          );
          return {
            watchlistBooks: books,
            watchlist: syncFlat(books, st.activeWatchlistId, st.symbolCatalog),
          };
        }),
      isWatched: (id) => {
        const st = get();
        const book = st.watchlistBooks.find((b) => b.id === st.activeWatchlistId);
        return !!book?.symbolIds.includes(id);
      },
      reorderWatch: (from, to) =>
        set((st) => {
          const books = st.watchlistBooks.map((b) => {
            if (b.id !== st.activeWatchlistId) return b;
            const next = [...b.symbolIds];
            const [item] = next.splice(from, 1);
            if (item == null) return b;
            next.splice(to, 0, item);
            return { ...b, symbolIds: next };
          });
          return {
            watchlistBooks: books,
            watchlist: syncFlat(books, st.activeWatchlistId, st.symbolCatalog),
          };
        }),
      setActiveWatchlist: (id) =>
        set((st) => ({
          activeWatchlistId: id,
          watchlist: syncFlat(st.watchlistBooks, id, st.symbolCatalog),
        })),
      createWatchlist: (name) =>
        set((st) => {
          const book: WatchlistBook = { id: uid(), name: name.trim() || "Watchlist", symbolIds: [] };
          const books = [...st.watchlistBooks, book];
          return {
            watchlistBooks: books,
            activeWatchlistId: book.id,
            watchlist: [],
          };
        }),
      renameWatchlist: (id, name) =>
        set((st) => ({
          watchlistBooks: st.watchlistBooks.map((b) => (b.id === id ? { ...b, name } : b)),
        })),
      deleteWatchlist: (id) =>
        set((st) => {
          if (st.watchlistBooks.length <= 1) return st;
          const books = st.watchlistBooks.filter((b) => b.id !== id);
          const activeWatchlistId =
            st.activeWatchlistId === id ? books[0]!.id : st.activeWatchlistId;
          return {
            watchlistBooks: books,
            activeWatchlistId,
            watchlist: syncFlat(books, activeWatchlistId, st.symbolCatalog),
          };
        }),
      toggleFavorite: (s) =>
        set((st) => ({
          favorites: st.favorites.some((f) => f.id === s.id)
            ? st.favorites.filter((f) => f.id !== s.id)
            : [...st.favorites, s],
          symbolCatalog: { ...st.symbolCatalog, [s.id]: s },
        })),
      isFavorite: (id) => get().favorites.some((f) => f.id === id),
      pushRecent: (s) =>
        set((st) => ({
          recents: [s, ...st.recents.filter((r) => r.id !== s.id)].slice(0, RECENT_LIMIT),
          symbolCatalog: { ...st.symbolCatalog, [s.id]: s },
        })),
    }),
    {
      name: "trademind.prefs",
      version: 3,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<PrefsState>;
        const catalog: Record<string, SymbolLite> = { ...(p.symbolCatalog ?? {}) };
        for (const s of p.watchlist ?? []) catalog[s.id] = s;
        for (const s of p.favorites ?? []) catalog[s.id] = s;
        for (const s of p.recents ?? []) catalog[s.id] = s;

        let books = p.watchlistBooks?.length ? p.watchlistBooks : DEFAULT_BOOKS.map((b) => ({ ...b }));
        const activeId = p.activeWatchlistId ?? "my-markets";
        if (!(p.watchlistBooks?.length) && (p.watchlist?.length ?? 0) > 0) {
          books = books.map((b) =>
            b.id === "my-markets"
              ? { ...b, symbolIds: (p.watchlist ?? []).map((s) => s.id) }
              : b,
          );
        }
        return {
          ...p,
          marketCategory: p.marketCategory ?? "crypto",
          market: "",
          watchlistBooks: books,
          activeWatchlistId: activeId,
          symbolCatalog: catalog,
          watchlist: syncFlat(books, activeId, catalog),
          favorites: p.favorites ?? [],
          recents: p.recents ?? [],
        } as PrefsState;
      },
    },
  ),
);
