import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MarketId } from "../lib/markets";
import type { SymbolLite } from "../lib/types";

const RECENT_LIMIT = 10;

interface PrefsState {
  /** Asset-class market filter for the AI Terminal. */
  marketCategory: MarketId;
  /** @deprecated Kept for migration — exchange_code filter. */
  market: string;
  watchlist: SymbolLite[];
  favorites: SymbolLite[];
  recents: SymbolLite[];
  setMarketCategory: (id: MarketId) => void;
  setMarket: (code: string) => void;
  addWatch: (s: SymbolLite) => void;
  removeWatch: (id: string) => void;
  isWatched: (id: string) => boolean;
  toggleFavorite: (s: SymbolLite) => void;
  isFavorite: (id: string) => boolean;
  pushRecent: (s: SymbolLite) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      marketCategory: "crypto",
      market: "",
      watchlist: [],
      favorites: [],
      recents: [],
      setMarketCategory: (id) => set({ marketCategory: id }),
      setMarket: (code) => set({ market: code }),
      addWatch: (s) =>
        set((st) => (st.watchlist.some((w) => w.id === s.id) ? st : { watchlist: [...st.watchlist, s] })),
      removeWatch: (id) => set((st) => ({ watchlist: st.watchlist.filter((w) => w.id !== id) })),
      isWatched: (id) => get().watchlist.some((w) => w.id === id),
      toggleFavorite: (s) =>
        set((st) => ({
          favorites: st.favorites.some((f) => f.id === s.id)
            ? st.favorites.filter((f) => f.id !== s.id)
            : [...st.favorites, s],
        })),
      isFavorite: (id) => get().favorites.some((f) => f.id === id),
      pushRecent: (s) =>
        set((st) => ({
          recents: [s, ...st.recents.filter((r) => r.id !== s.id)].slice(0, RECENT_LIMIT),
        })),
    }),
    {
      name: "trademind.prefs",
      version: 2,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<PrefsState>;
        return {
          ...p,
          marketCategory: p.marketCategory ?? "crypto",
          market: "",
        } as PrefsState;
      },
    },
  ),
);
