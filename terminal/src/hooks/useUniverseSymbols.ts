/**
 * Resolve the four V3 universe symbols from the live API (IDs are UUIDs).
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { endpoints } from "../lib/endpoints";
import { UNIVERSE, type UniverseDef } from "../lib/universe";
import type { Symbol, SymbolLite } from "../lib/types";

export interface UniverseSymbol extends UniverseDef {
  symbol: Symbol | null;
  lite: SymbolLite | null;
}

export function useUniverseSymbols() {
  const queries = useQueries({
    queries: UNIVERSE.map((u) => ({
      queryKey: ["universe-symbol", u.exchange, u.code],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        endpoints.symbols({ search: u.code, exchange: u.exchange, pageSize: 40 }, signal),
      staleTime: 10 * 60_000,
    })),
  });

  const items = useMemo<UniverseSymbol[]>(() => {
    return UNIVERSE.map((u, i) => {
      const list = queries[i]?.data?.items ?? [];
      const exact =
        list.find((s) => s.symbol_code.toUpperCase() === u.code.toUpperCase()) ??
        list.find((s) => s.symbol_code.toUpperCase().includes(u.code.toUpperCase())) ??
        null;
      const lite: SymbolLite | null = exact
        ? {
            id: exact.id,
            symbol_code: exact.symbol_code,
            name: u.name,
            exchange_code: exact.exchange_code,
          }
        : null;
      return { ...u, symbol: exact, lite };
    });
  }, [queries]);

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.every((q) => q.isError);
  const ready = items.filter((i) => i.lite);

  return { items, ready, isLoading, isError, refetch: () => queries.forEach((q) => void q.refetch()) };
}
