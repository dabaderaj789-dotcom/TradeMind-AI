import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { deriveDecision } from "../lib/decision";
import { endpoints } from "../lib/endpoints";
import { directionTone } from "../lib/format";
import { classifySymbol, type MarketId } from "../lib/markets";
import { qk } from "../lib/queryKeys";
import type { Symbol as Sym, TradeSetup, Trend } from "../lib/types";

export type OutlookBias = "Bullish" | "Bearish" | "Neutral";

export interface BriefOpportunity {
  id: string;
  code: string;
  name: string;
  kind: string;
  tone: "bull" | "bear" | "warn" | "neutral" | "info" | "brand";
  confidence: number | null;
  market: MarketId;
}

const OUTLOOK_MARKETS: { id: MarketId; label: string; exchange?: string }[] = [
  { id: "crypto", label: "Crypto", exchange: "binance" },
  { id: "india", label: "India", exchange: "nse" },
  { id: "forex", label: "Forex" },
];

function biasFromTrends(trends: (Trend | null | undefined)[]): OutlookBias {
  let bull = 0;
  let bear = 0;
  for (const t of trends) {
    if (!t) continue;
    const tone = directionTone(t.trend);
    if (tone === "bull") bull += 1;
    else if (tone === "bear") bear += 1;
  }
  if (bull === 0 && bear === 0) return "Neutral";
  if (bull > bear + 1) return "Bullish";
  if (bear > bull + 1) return "Bearish";
  return "Neutral";
}

function toLite(s: Sym) {
  return {
    id: s.id,
    symbol_code: s.symbol_code,
    name: s.name,
    exchange_code: s.exchange_code,
    market_type: s.market_type,
  };
}

/** Morning brief: multi-market outlook + top opportunities. */
export function useMorningBrief(tf = "1h") {
  const lists = useQueries({
    queries: OUTLOOK_MARKETS.map((m) => ({
      queryKey: ["brief-universe", m.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        endpoints.symbols({ pageSize: 40, exchange: m.exchange }, signal),
      staleTime: 5 * 60_000,
    })),
  });

  const samples = useMemo(() => {
    return OUTLOOK_MARKETS.map((m, i) => {
      const items = (lists[i]?.data?.items ?? [])
        .map(toLite)
        .filter(
          (s) =>
            classifySymbol(s.symbol_code, s.name, s.market_type, s.exchange_code) === m.id,
        )
        .slice(0, 8);
      return { market: m, symbols: items };
    });
  }, [lists]);

  const flat = useMemo(() => samples.flatMap((s) => s.symbols), [samples]);

  const trendQs = useQueries({
    queries: flat.map((s) => ({
      queryKey: qk.scanTrend(s.id, tf),
      queryFn: ({ signal }: { signal: AbortSignal }) => endpoints.trend(s.id, tf, signal),
      staleTime: 60_000,
      retry: 0,
    })),
  });

  const setupQs = useQueries({
    queries: flat.map((s) => ({
      queryKey: qk.scanSetups(s.id, tf),
      queryFn: ({ signal }: { signal: AbortSignal }) => endpoints.activeSetups(s.id, tf, 3, signal),
      staleTime: 60_000,
      retry: 0,
    })),
  });

  const strategiesQ = useQuery({
    queryKey: qk.strategies,
    queryFn: ({ signal }) => endpoints.strategies(signal),
    staleTime: 5 * 60_000,
  });

  const outlook = useMemo(() => {
    let offset = 0;
    return samples.map(({ market, symbols }) => {
      const slice = trendQs.slice(offset, offset + symbols.length).map((q) => q.data as Trend | undefined);
      offset += symbols.length;
      return {
        id: market.id,
        label: market.label,
        bias: biasFromTrends(slice),
      };
    });
  }, [samples, trendQs]);

  const opportunities = useMemo<BriefOpportunity[]>(() => {
    const strats = strategiesQ.data?.items ?? [];
    const scored: BriefOpportunity[] = flat.map((s, i) => {
      const setups: TradeSetup[] = setupQs[i]?.data?.items ?? [];
      const top = [...setups].sort((a, b) => b.confidence_score - a.confidence_score)[0] ?? null;
      const trend = (trendQs[i]?.data as Trend | undefined) ?? null;
      const strategy =
        top != null
          ? strats.find((st) => st.required_setup_types.includes(top.setup_type)) ?? null
          : null;
      const decision = deriveDecision({ trend, setup: top, strategy });
      const market = classifySymbol(s.symbol_code, s.name, s.market_type, s.exchange_code);
      return {
        id: s.id,
        code: s.symbol_code,
        name: s.name,
        kind: decision.kind,
        tone: decision.tone,
        confidence: decision.actionable ? Math.round(decision.confidence) : null,
        market,
      };
    });

    // Prefer actionable calls, then highest confidence; keep WAITS if needed to fill.
    return scored
      .sort((a, b) => {
        const aAct = a.confidence != null ? 1 : 0;
        const bAct = b.confidence != null ? 1 : 0;
        if (bAct !== aAct) return bAct - aAct;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      })
      .slice(0, 5);
  }, [flat, setupQs, trendQs, strategiesQ.data]);

  const isLoading =
    lists.some((q) => q.isLoading) ||
    (flat.length > 0 && (trendQs.some((q) => q.isLoading) || setupQs.some((q) => q.isLoading)));

  return { outlook, opportunities, isLoading };
}
