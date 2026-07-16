import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { num } from "../lib/format";
import type { Opportunity, WatchItem } from "../lib/types";

export function useWatchlistData(items: WatchItem[], timeframe: string, nonce: number) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number | undefined>>({});
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const key = items.map((i) => i.id).join(",");

  const load = useCallback(async () => {
    const id = ++reqId.current;
    if (items.length === 0) {
      setOpportunities([]);
      setQuotes({});
      return;
    }
    setLoading(true);

    const results = await Promise.all(
      items.map(async (item) => {
        const [setupsR, candlesR] = await Promise.allSettled([
          api.activeSetups(item.id, timeframe, 5),
          api.latestCandles(item.id, timeframe, 1),
        ]);
        const setups = setupsR.status === "fulfilled" ? setupsR.value.items : [];
        const close =
          candlesR.status === "fulfilled" && candlesR.value.items.length
            ? num(candlesR.value.items[candlesR.value.items.length - 1].close)
            : undefined;
        return { item, setups, close };
      }),
    );

    if (id !== reqId.current) return;

    const opps: Opportunity[] = [];
    const q: Record<string, number | undefined> = {};
    for (const { item, setups, close } of results) {
      q[item.id] = close;
      for (const setup of setups) {
        opps.push({ symbolId: item.id, symbolCode: item.symbol_code, setup });
      }
    }
    setOpportunities(opps);
    setQuotes(q);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, timeframe]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  return { opportunities, quotes, loading, refresh: load };
}
