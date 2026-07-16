import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../lib/endpoints";
import { qk } from "../lib/queryKeys";
import { useSettings } from "../store/settings";

function useInterval() {
  const ms = useSettings((s) => s.refreshInterval);
  return ms > 0 ? ms : (false as const);
}

export function useExchanges() {
  return useQuery({
    queryKey: qk.exchanges,
    queryFn: ({ signal }) => endpoints.exchanges(signal),
    staleTime: 5 * 60_000,
  });
}

export function useCalendarEvents() {
  return useQuery({
    queryKey: qk.calendar,
    queryFn: ({ signal }) => endpoints.calendarEvents(signal),
    staleTime: 5 * 60_000,
  });
}

export function useSymbolSearch(search: string, exchange: string, enabled = true) {
  return useQuery({
    queryKey: qk.symbols(search, exchange),
    queryFn: ({ signal }) =>
      endpoints.symbols(
        {
          search,
          exchange,
          pageSize: search.trim() ? 80 : 200,
        },
        signal,
      ),
    enabled,
    staleTime: 60_000,
  });
}

export function useCandles(id: string | null, tf: string) {
  const refetchInterval = useInterval();
  return useQuery({
    queryKey: qk.candles(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.candles(id!, tf, 400, signal),
    enabled: !!id,
    staleTime: 15_000,
    refetchInterval,
  });
}

export function useMarketQuote(id: string | null) {
  const refetchInterval = useInterval();
  return useQuery({
    queryKey: qk.quote(id ?? ""),
    queryFn: ({ signal }) => endpoints.quote(id!, signal),
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: refetchInterval || 15_000,
    retry: 1,
  });
}

export function useQuoteVerify(id: string | null, enabled = false) {
  return useQuery({
    queryKey: qk.quoteVerify(id ?? ""),
    queryFn: ({ signal }) => endpoints.quoteVerify(id!, signal),
    enabled: !!id && enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: 0,
  });
}

export function useTrend(id: string | null, tf: string) {
  const refetchInterval = useInterval();
  return useQuery({
    queryKey: qk.trend(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.trend(id!, tf, signal),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval,
    retry: 0,
  });
}

export function useLevels(id: string | null, tf: string) {
  return useQuery({
    queryKey: qk.levels(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.levels(id!, tf, signal),
    enabled: !!id,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useStructureEvents(id: string | null, tf: string) {
  return useQuery({
    queryKey: qk.events(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.events(id!, tf, 80, signal),
    enabled: !!id,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useOrderBlocks(id: string | null, tf: string) {
  return useQuery({
    queryKey: qk.orderBlocks(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.orderBlocks(id!, tf, signal),
    enabled: !!id,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useFvgs(id: string | null, tf: string) {
  return useQuery({
    queryKey: qk.fvgs(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.fvgs(id!, tf, signal),
    enabled: !!id,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useSweeps(id: string | null, tf: string) {
  return useQuery({
    queryKey: qk.sweeps(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.sweeps(id!, tf, signal),
    enabled: !!id,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useActiveSetups(id: string | null, tf: string) {
  const refetchInterval = useInterval();
  return useQuery({
    queryKey: qk.activeSetups(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.activeSetups(id!, tf, 25, signal),
    enabled: !!id,
    staleTime: 20_000,
    refetchInterval,
    retry: 0,
  });
}

export function useHistoricalSetups(id: string | null, tf: string) {
  return useQuery({
    queryKey: qk.historicalSetups(id ?? "", tf),
    queryFn: ({ signal }) => endpoints.historicalSetups(id!, tf, 50, signal),
    enabled: !!id,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useStrategies() {
  return useQuery({
    queryKey: qk.strategies,
    queryFn: ({ signal }) => endpoints.strategies(signal),
    staleTime: 5 * 60_000,
  });
}

export function useStrategyDetail(strategyId: string | null, id: string | null, tf: string) {
  return useQuery({
    queryKey: qk.strategyDetail(strategyId ?? "", id ?? "", tf),
    queryFn: ({ signal }) => endpoints.strategyDetail(strategyId!, id!, tf, signal),
    enabled: !!strategyId && !!id,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useAnalysis(id: string | null, tf: string, plugin: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.analysis(id ?? "", tf, plugin),
    queryFn: ({ signal }) => endpoints.analysisResults(id!, tf, plugin, 400, signal),
    enabled: !!id && enabled,
    staleTime: 60_000,
    retry: 0,
  });
}
