import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  Candle,
  Fvg,
  Levels,
  LiquiditySweep,
  OrderBlock,
  StrategyDetail,
  StrategyMetadata,
  StructureEvents,
  TradeSetup,
  Trend,
} from "../lib/types";

export interface SymbolData {
  candles: Candle[];
  trend: Trend | null;
  levels: Levels | null;
  events: StructureEvents | null;
  orderBlocks: OrderBlock[];
  fvgs: Fvg[];
  sweeps: LiquiditySweep[];
  activeSetups: TradeSetup[];
  historicalSetups: TradeSetup[];
  strategyDetail: StrategyDetail | null;
}

const EMPTY: SymbolData = {
  candles: [],
  trend: null,
  levels: null,
  events: null,
  orderBlocks: [],
  fvgs: [],
  sweeps: [],
  activeSetups: [],
  historicalSetups: [],
  strategyDetail: null,
};

const orNull = <T>(r: PromiseSettledResult<T>): T | null =>
  r.status === "fulfilled" ? r.value : null;

const listOf = <T>(r: PromiseSettledResult<{ items: T[] }>): T[] =>
  r.status === "fulfilled" ? r.value.items : [];

let strategiesCache: StrategyMetadata[] | null = null;

async function getStrategies(): Promise<StrategyMetadata[]> {
  if (strategiesCache) return strategiesCache;
  try {
    const res = await api.listStrategies();
    strategiesCache = res.items;
    return res.items;
  } catch {
    return [];
  }
}

export function useSymbolData(symbolId: string | null, timeframe: string) {
  const [data, setData] = useState<SymbolData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!symbolId) {
      setData(EMPTY);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);

    const [
      candlesR,
      trendR,
      levelsR,
      eventsR,
      obR,
      fvgR,
      sweepR,
      activeR,
      histR,
    ] = await Promise.allSettled([
      api.latestCandles(symbolId, timeframe),
      api.trend(symbolId, timeframe),
      api.levels(symbolId, timeframe),
      api.structureEvents(symbolId, timeframe),
      api.orderBlocks(symbolId, timeframe),
      api.fairValueGaps(symbolId, timeframe),
      api.liquiditySweeps(symbolId, timeframe),
      api.activeSetups(symbolId, timeframe),
      api.historicalSetups(symbolId, timeframe),
    ]);

    if (id !== reqId.current) return; // stale response

    const activeSetups = listOf(activeR);

    // Resolve the strategy that best matches the strongest active setup.
    let strategyDetail: StrategyDetail | null = null;
    const top = [...activeSetups].sort(
      (a: TradeSetup, b: TradeSetup) => b.confidence_score - a.confidence_score,
    )[0];
    if (top) {
      const strategies = await getStrategies();
      const match = strategies.find((s) => s.required_setup_types.includes(top.setup_type));
      if (match && id === reqId.current) {
        try {
          strategyDetail = await api.strategyDetail(match.strategy_id, symbolId, timeframe);
        } catch {
          strategyDetail = { strategy: match, recent_plans: [] };
        }
      }
    }

    if (id !== reqId.current) return;

    setData({
      candles: listOf(candlesR),
      trend: orNull(trendR),
      levels: orNull(levelsR),
      events: orNull(eventsR),
      orderBlocks: listOf(obR),
      fvgs: listOf(fvgR),
      sweeps: listOf(sweepR),
      activeSetups,
      historicalSetups: listOf(histR),
      strategyDetail,
    });
    if (candlesR.status === "rejected") {
      const reason = candlesR.reason as { message?: string } | undefined;
      setError(reason?.message ?? "Failed to load market data.");
    }
    setLoading(false);
    setLastUpdated(new Date().toISOString());
  }, [symbolId, timeframe]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, lastUpdated, refresh: load };
}
