import { useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { derivePredictivePlan } from "../lib/predictiveSignal";
import { MTF_TIMEFRAMES, type MtfTimeframe, buildAnnotations, deriveDecision } from "../lib/decision";
import { num } from "../lib/format";
import { classifySymbol } from "../lib/markets";
import { endpoints } from "../lib/endpoints";
import { qk } from "../lib/queryKeys";
import type { TradeSetup } from "../lib/types";
import { useBacktestStore } from "../store/backtest";
import {
  useActiveSetups,
  useCandles,
  useFvgs,
  useMarketQuote,
  useOrderBlocks,
  useStrategies,
  useSweeps,
  useTrend,
} from "./queries";
import { useRecommendation } from "./useRecommendation";
import { useSymbolMeta } from "./useSymbolMeta";

export function useDecision(id: string | null, tf: string) {
  const trendQ = useTrend(id, tf);
  const setupsQ = useActiveSetups(id, tf);
  const strategiesQ = useStrategies();
  const candlesQ = useCandles(id, tf);
  const quoteQ = useMarketQuote(id);
  const obQ = useOrderBlocks(id, tf);
  const fvgQ = useFvgs(id, tf);
  const sweepQ = useSweeps(id, tf);
  const meta = useSymbolMeta(id ?? undefined);
  const upsertFromPlan = useBacktestStore((s) => s.upsertFromPlan);
  const cancelActive = useBacktestStore((s) => s.cancelActive);
  const prevActionable = useRef(false);

  const mtfTrendQs = useQueries({
    queries: MTF_TIMEFRAMES.map((mtf) => ({
      queryKey: qk.trend(id ?? "", mtf),
      queryFn: ({ signal }: { signal: AbortSignal }) => endpoints.trend(id!, mtf, signal),
      enabled: !!id,
      staleTime: 30_000,
      retry: 0,
    })),
  });

  const mtfTrends = useMemo(() => {
    const out: Partial<Record<MtfTimeframe, (typeof trendQ.data) | null>> = {};
    MTF_TIMEFRAMES.forEach((mtf, i) => {
      out[mtf] = mtfTrendQs[i]?.data ?? null;
    });
    return out;
  }, [mtfTrendQs, trendQ.data]);

  /** Prefer highest-confidence fresh setup — never the first stale item. */
  const topSetup = useMemo(() => {
    const items = setupsQ.data?.items ?? [];
    if (!items.length) return null;
    const fresh = items.filter(
      (s) => !s.signal_state || !/expir|invalid|cancel|fail|mitigat/i.test(s.signal_state),
    );
    const pool = fresh.length ? fresh : items;
    return [...pool].sort((a, b) => b.confidence_score - a.confidence_score)[0] ?? null;
  }, [setupsQ.data?.items]);
  const rec = useRecommendation(id, tf, topSetup);

  const candles = candlesQ.data?.items ?? [];

  const lastPrice = useMemo(() => {
    if (quoteQ.data?.current_price) return num(quoteQ.data.current_price);
    if (!candles.length) return 0;
    return num(candles[candles.length - 1].close);
  }, [quoteQ.data, candles]);

  const decision = useMemo(
    () =>
      deriveDecision({
        trend: trendQ.data,
        setup: topSetup,
        strategy: rec.strategy,
        orderBlocks: obQ.data?.items,
        fvgs: fvgQ.data?.items,
        sweeps: sweepQ.data?.items,
        candles,
        mtfTrends,
      }),
    [
      trendQ.data,
      topSetup,
      rec.strategy,
      obQ.data,
      fvgQ.data,
      sweepQ.data,
      candles,
      mtfTrends,
    ],
  );

  const predictive = useMemo(() => {
    if (!decision.actionable || !topSetup || !lastPrice) return null;
    return derivePredictivePlan({
      setup: topSetup,
      lastPrice,
      strategy: rec.strategy,
      trend: trendQ.data,
      orderBlocks: obQ.data?.items,
      fvgs: fvgQ.data?.items,
      sweeps: sweepQ.data?.items,
      decision,
    });
  }, [
    decision,
    topSetup,
    lastPrice,
    rec.strategy,
    trendQ.data,
    obQ.data,
    fvgQ.data,
    sweepQ.data,
  ]);

  // Automatic trade outcome tracking
  useEffect(() => {
    if (!id || !predictive || !decision.actionable) {
      if (prevActionable.current && id && lastPrice) {
        cancelActive(id, tf, lastPrice, "Decision flipped to WAIT — plan cancelled");
      }
      prevActionable.current = false;
      return;
    }
    prevActionable.current = true;
    const code = meta?.symbol_code ?? id;
    const market = classifySymbol(meta?.symbol_code ?? "", meta?.name ?? "", "", meta?.exchange_code ?? "");
    upsertFromPlan({
      plan: predictive,
      decision,
      symbolId: id,
      symbolCode: code,
      market,
      timeframe: tf,
    });
  }, [id, tf, predictive, decision, meta, lastPrice, upsertFromPlan, cancelActive]);

  const annotations = useMemo(() => {
    const lookup = (s: TradeSetup) => {
      const match = strategiesQ.data?.items.find((st) => st.required_setup_types.includes(s.setup_type));
      return match?.strategy_name ?? "Structure Confluence";
    };
    return buildAnnotations(decision, setupsQ.data?.items ?? [], lookup);
  }, [decision, setupsQ.data, strategiesQ.data]);

  return {
    decision,
    predictive,
    annotations,
    topSetup,
    strategy: rec.strategy,
    plan: rec.detail?.recent_plans?.[0] ?? null,
    trend: trendQ.data ?? null,
    setups: setupsQ.data?.items ?? [],
    lastPrice,
    isLoading:
      trendQ.isLoading ||
      setupsQ.isLoading ||
      rec.isLoading ||
      candlesQ.isLoading ||
      mtfTrendQs.some((q) => q.isLoading),
  };
}
