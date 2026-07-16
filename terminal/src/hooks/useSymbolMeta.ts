import { useMemo } from "react";
import type { SymbolLite } from "../lib/types";
import { usePrefs } from "../store/prefs";

/** Resolves symbol metadata from local prefs (watchlist / favorites / recents). */
export function useSymbolMeta(id: string | undefined): SymbolLite | null {
  const watchlist = usePrefs((s) => s.watchlist);
  const favorites = usePrefs((s) => s.favorites);
  const recents = usePrefs((s) => s.recents);
  return useMemo(() => {
    if (!id) return null;
    return (
      [...recents, ...watchlist, ...favorites].find((s) => s.id === id) ?? null
    );
  }, [id, watchlist, favorites, recents]);
}
