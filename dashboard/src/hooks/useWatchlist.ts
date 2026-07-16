import { useCallback, useEffect, useState } from "react";
import type { WatchItem } from "../lib/types";

const KEY = "trademind.watchlist";

const DEFAULTS: WatchItem[] = [];

function load(): WatchItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore quota errors */
    }
  }, [items]);

  const add = useCallback((item: WatchItem) => {
    setItems((prev) =>
      prev.some((i) => i.id === item.id)
        ? prev
        : [...prev, { id: item.id, symbol_code: item.symbol_code, name: item.name }],
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const has = useCallback((id: string | undefined) => (id ? items.some((i) => i.id === id) : false), [items]);

  return { items, add, remove, has };
}
