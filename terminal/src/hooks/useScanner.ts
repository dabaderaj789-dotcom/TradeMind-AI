import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { endpoints } from "../lib/endpoints";
import { classifySymbol, filterByMarket } from "../lib/markets";
import { qk } from "../lib/queryKeys";
import type { ScanRow, SymbolLite, TradeSetup, Trend } from "../lib/types";
import { usePrefs } from "../store/prefs";

const UNIVERSE_LIMIT = 28;

function toLite(s: {
  id: string;
  symbol_code: string;
  name: string;
  exchange_code: string;
}): SymbolLite {
  return { id: s.id, symbol_code: s.symbol_code, name: s.name, exchange_code: s.exchange_code };
}

/** Builds the scan universe: watchlist + recents + top symbols of the selected market. */
export function useScanUniverse() {
  const marketCategory = usePrefs((s) => s.marketCategory);
  const watchlist = usePrefs((s) => s.watchlist);
  const recents = usePrefs((s) => s.recents);

  const marketList = useQuery({
    queryKey: qk.symbols("__universe__", marketCategory),
    queryFn: ({ signal }) =>
      endpoints.symbols(
        {
          pageSize: 120,
          exchange: marketCategory === "india" ? "nse" : marketCategory === "crypto" ? "binance" : undefined,
        },
        signal,
      ),
    staleTime: 5 * 60_000,
  });

  const universe = useMemo<SymbolLite[]>(() => {
    const seen = new Set<string>();
    const out: SymbolLite[] = [];
    const push = (s: SymbolLite) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    };
    // Prefer market-matching symbols from the API; do not fall back across markets.
    filterByMarket(marketList.data?.items ?? [], marketCategory)
      .map(toLite)
      .forEach(push);
    watchlist.filter((s) => classifySymbol(s.symbol_code, s.name, "", s.exchange_code) === marketCategory).forEach(push);
    recents.filter((s) => classifySymbol(s.symbol_code, s.name, "", s.exchange_code) === marketCategory).forEach(push);
    return out.slice(0, UNIVERSE_LIMIT);
  }, [watchlist, recents, marketList.data, marketCategory]);

  return { universe, loadingUniverse: marketList.isLoading, error: marketList.error };
}

export function useScanner(tf: string) {
  const { universe, loadingUniverse } = useScanUniverse();

  const setupQueries = useQueries({
    queries: universe.map((s) => ({
      queryKey: qk.scanSetups(s.id, tf),
      queryFn: ({ signal }: { signal: AbortSignal }) => endpoints.activeSetups(s.id, tf, 5, signal),
      staleTime: 30_000,
      retry: 0,
    })),
  });

  const trendQueries = useQueries({
    queries: universe.map((s) => ({
      queryKey: qk.scanTrend(s.id, tf),
      queryFn: ({ signal }: { signal: AbortSignal }) => endpoints.trend(s.id, tf, signal),
      staleTime: 30_000,
      retry: 0,
    })),
  });

  const rows = useMemo<ScanRow[]>(() => {
    return universe.map((symbol, i) => {
      const setups: TradeSetup[] = setupQueries[i]?.data?.items ?? [];
      const top = [...setups].sort((a, b) => b.confidence_score - a.confidence_score)[0] ?? null;
      const trend: Trend | null = (trendQueries[i]?.data as Trend | undefined) ?? null;
      return { symbol, trend, topSetup: top, setupCount: setups.length };
    });
  }, [universe, setupQueries, trendQueries]);

  const isFetching =
    loadingUniverse ||
    setupQueries.some((q) => q.isFetching) ||
    trendQueries.some((q) => q.isFetching);

  const refetch = () => {
    setupQueries.forEach((q) => void q.refetch());
    trendQueries.forEach((q) => void q.refetch());
  };

  return { rows, isFetching, refetch, count: universe.length };
}
