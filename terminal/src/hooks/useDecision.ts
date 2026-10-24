import { useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { derivePredictivePlan, type PredictivePlan } from "../lib/predictiveSignal";
import { MTF_TIMEFRAMES, type MtfTimeframe, buildAnnotations, deriveDecision, type AiDecision } from "../lib/decision";
import { deriveIntradayDecision } from "../lib/intradayDecision";
import { SCALPING_MODEL } from "../lib/decisionProfiles";
import { analyzeExpirySession, enrichDecisionForExpiry } from "../lib/expiryIntelligence";
import { deriveExecutionCard } from "../lib/executionTradeCard";
import { isPastIndiaCashClose, todayIstYmd, useExpiryReview } from "../lib/expiryReview";
import { analyzeLateSession } from "../lib/lateSessionIntelligence";
import { useLiveValidation } from "../lib/liveValidation";
import { usePaperTrading } from "../lib/paperTrading";
import { useMissedOpportunity } from "../lib/missedOpportunity";
import { usePersonalityLearning } from "../lib/personalityLearning";
import { num } from "../lib/format";
import { classifySymbol } from "../lib/markets";
import { endpoints } from "../lib/endpoints";
import { qk } from "../lib/queryKeys";
import type { Candle, TradeSetup } from "../lib/types";
import { useAiJournal } from "../lib/aiJournal";
import { useBacktestStore } from "../store/backtest";
import { useSettings } from "../store/settings";
import {
  useActiveSetups,
  useAnalysis,
  useCandles,
  useFvgs,
  useLevels,
  useMarketQuote,
  useOrderBlocks,
  useStrategies,
  useStructureEvents,
  useSweeps,
  useTrend,
} from "./queries";
import { useRecommendation } from "./useRecommendation";
import { useSymbolMeta } from "./useSymbolMeta";

const EMPTY_CANDLES: Candle[] = [];

export function useDecision(id: string | null, tf: string) {
  const decisionProfile = useSettings((s) => s.decisionProfile);
  const overlays = useSettings((s) => s.overlays);
  const trendQ = useTrend(id, tf);
  const setupsQ = useActiveSetups(id, tf);
  const strategiesQ = useStrategies();
  const candlesQ = useCandles(id, tf);
  const quoteQ = useMarketQuote(id);
  const obQ = useOrderBlocks(id, tf);
  const fvgQ = useFvgs(id, tf);
  const sweepQ = useSweeps(id, tf);
  const structureQ = useStructureEvents(id, tf);
  const levelsQ = useLevels(id, tf);
  const emaQ = useAnalysis(id, tf, "ema", !!overlays.ema && (decisionProfile === "intraday" || decisionProfile === "scalping"));
  const vwapQ = useAnalysis(id, tf, "vwap", (!!overlays.vwap || decisionProfile === "intraday" || decisionProfile === "scalping"));
  const meta = useSymbolMeta(id ?? undefined);
  const upsertFromPlan = useBacktestStore((s) => s.upsertFromPlan);
  const cancelActive = useBacktestStore((s) => s.cancelActive);
  const recordSignal = useAiJournal((s) => s.recordSignal);
  const markPriceUpdate = useAiJournal((s) => s.markPriceUpdate);
  const journalEntries = useAiJournal((s) => s.entries);
  const recordMissed = useMissedOpportunity((s) => s.recordDecision);
  const evaluateMissedPrice = useMissedOpportunity((s) => s.evaluatePrice);
  const missedDayReport = useMissedOpportunity((s) => s.dayReport);
  const logValidation = useLiveValidation((s) => s.logDecision);
  const tickValidation = useLiveValidation((s) => s.tickPrice);
  const validationEnabled = useLiveValidation((s) => s.enabled);
  const openPaper = usePaperTrading((s) => s.openFromDecision);
  const paperPrice = usePaperTrading((s) => s.onPrice);
  const paperEnabled = usePaperTrading((s) => s.enabled);
  const recordPersonality = usePersonalityLearning((s) => s.recordLive);
  const evaluatePersonality = usePersonalityLearning((s) => s.evaluateForward);
  const closePersonalitySession = usePersonalityLearning((s) => s.closeSession);
  const personalityStatsFn = usePersonalityLearning((s) => s.stats);
  const bestPersonalitiesFn = usePersonalityLearning((s) => s.bestPersonalities);
  const saveExpirySnapshot = useExpiryReview((s) => s.saveSnapshot);
  const generateExpiryReview = useExpiryReview((s) => s.generateReview);
  const expiryReviews = useExpiryReview((s) => s.reviews);
  const prevActionable = useRef(false);
  const predictiveRef = useRef<PredictivePlan | null>(null);
  const decisionRef = useRef<AiDecision | null>(null);
  const reviewFired = useRef<string | null>(null);

  const mtfTrendQs = useQueries({
    queries: MTF_TIMEFRAMES.map((mtf) => ({
      queryKey: qk.trend(id ?? "", mtf),
      queryFn: ({ signal }: { signal: AbortSignal }) => endpoints.trend(id!, mtf, signal),
      enabled: !!id,
      staleTime: 30_000,
      retry: 0,
    })),
  });

  const candles = candlesQ.data?.items;
  const candleItems = candles ?? EMPTY_CANDLES;

  const lastPrice = useMemo(() => {
    if (quoteQ.data?.current_price) return num(quoteQ.data.current_price);
    if (!candleItems.length) return 0;
    return num(candleItems[candleItems.length - 1].close);
  }, [quoteQ.data, candleItems]);

  const mtfUpdated = mtfTrendQs.map((q) => q.dataUpdatedAt).join("|");
  const mtfTrends = useMemo(() => {
    const out: Partial<Record<MtfTimeframe, (typeof trendQ.data) | null>> = {};
    MTF_TIMEFRAMES.forEach((mtf, i) => {
      out[mtf] = mtfTrendQs[i]?.data ?? null;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by dataUpdatedAt
  }, [mtfUpdated, trendQ.data]);

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

  const profile =
    decisionProfile === "swing" ? "institutional" : decisionProfile;

  const symbolCode = meta?.symbol_code ?? "";

  const expiryIntel = useMemo(
    () =>
      analyzeExpirySession({
        symbolCode: symbolCode || "",
        candles: candleItems,
        trend: trendQ.data,
      }),
    [symbolCode, candleItems, trendQ.data],
  );

  const personalityStats = useMemo(() => personalityStatsFn(), [personalityStatsFn, decisionProfile, candleItems.length]);

  const decision = useMemo(() => {
    const base = {
      trend: trendQ.data,
      setup: topSetup,
      strategy: rec.strategy,
      orderBlocks: obQ.data?.items,
      fvgs: fvgQ.data?.items,
      sweeps: sweepQ.data?.items,
      candles: candleItems,
      mtfTrends,
    };
    const raw =
      profile === "intraday" || profile === "scalping"
        ? deriveIntradayDecision({
            ...base,
            structureEvents: structureQ.data ?? null,
            levels: levelsQ.data ?? null,
            emaBars: emaQ.data?.items ?? null,
            vwapBars: vwapQ.data?.items ?? null,
            emaEnabled: !!overlays.ema,
            vwapEnabled: true,
            personalityStats,
            timeframe: tf,
            model: profile === "scalping" ? SCALPING_MODEL : undefined,
          })
        : deriveDecision(base);
    return enrichDecisionForExpiry(raw, expiryIntel);
  }, [
    profile,
    trendQ.data,
    topSetup,
    rec.strategy,
    obQ.data,
    fvgQ.data,
    sweepQ.data,
    structureQ.data,
    levelsQ.data,
    emaQ.data,
    vwapQ.data,
    overlays.ema,
    candleItems,
    mtfTrends,
    tf,
    expiryIntel,
    personalityStats,
  ]);

  const lateSession = useMemo(
    () =>
      analyzeLateSession({
        candles: candleItems,
        trend: trendQ.data,
        levels: levelsQ.data ?? null,
        structureEvents: structureQ.data ?? null,
        expiry: expiryIntel,
      }),
    [candleItems, trendQ.data, levelsQ.data, structureQ.data, expiryIntel],
  );

  const predictive = useMemo(() => {
    if (!decision.actionable || !topSetup || !lastPrice) return null;
    const plan = derivePredictivePlan({
      setup: topSetup,
      lastPrice,
      strategy: rec.strategy,
      trend: trendQ.data,
      orderBlocks: obQ.data?.items,
      fvgs: fvgQ.data?.items,
      sweeps: sweepQ.data?.items,
      decision,
    });
    // Intraday: still show the plan when geometry was projected to ≥2R
    if (!plan.planValid && profile !== "intraday") return null;
    if (!plan.planValid && profile === "intraday" && (plan.riskReward ?? 0) < 1.8) return null;
    return plan;
  }, [
    decision,
    topSetup,
    lastPrice,
    rec.strategy,
    trendQ.data,
    obQ.data,
    fvgQ.data,
    sweepQ.data,
    profile,
  ]);

  // Automatic trade outcome tracking — keyed so unstable object identity cannot loop.
  predictiveRef.current = predictive;
  decisionRef.current = decision;
  const trackKey =
    id && predictive && decision.actionable
      ? `${id}:${tf}:${profile}:${predictive.setup.setup_id}:${predictive.state}:${Math.round(decision.confidence)}`
      : id && !decision.actionable
        ? `wait:${id}:${tf}:${profile}`
        : "";

  useEffect(() => {
    const plan = predictiveRef.current;
    const dec = decisionRef.current;
    if (!id || !dec) return;

    const code = meta?.symbol_code ?? id;
    recordSignal({
      symbolId: id,
      symbolCode: code,
      timeframe: tf,
      profile,
      decision: dec,
      plan: plan && dec.actionable ? plan : null,
    });

    if (lastPrice) {
      markPriceUpdate(id, tf, lastPrice);
      recordMissed({
        symbolId: id,
        symbolCode: code,
        timeframe: tf,
        profile,
        decision: dec,
        price: lastPrice,
      });
      evaluateMissedPrice(id, tf, lastPrice);
      tickValidation(id, tf, lastPrice);
      paperPrice(id, tf, lastPrice);

      if (validationEnabled) {
        logValidation({
          symbolId: id,
          symbolCode: code,
          timeframe: tf,
          profile,
          price: lastPrice,
          decision: dec,
          candles: candleItems,
          trend: trendQ.data,
          structureEvents: structureQ.data ?? null,
          levels: levelsQ.data ?? null,
          expiry: expiryIntel,
          lateSession,
        });
      }
      if (paperEnabled && dec.actionable) {
        openPaper({
          symbolId: id,
          symbolCode: code,
          timeframe: tf,
          profile,
          decision: dec,
          lastPrice,
        });
      }

      if ((profile === "intraday" || profile === "scalping") && dec.personality) {
        const p = dec.personality;
        recordPersonality({
          symbolId: id,
          symbolCode: code,
          timeframe: tf,
          personality: {
            id: p.id as import("../lib/marketPersonality").MarketPersonalityId,
            label: p.label,
            bias: p.bias,
            strength: p.strength,
            confidence: p.confidence,
            characteristics: p.characteristics,
            preferredAction: p.preferredAction,
            earlyBias: 0,
            confirmPatience: 0,
            alternatives: p.alternatives.map((a) => ({
              id: a.id as import("../lib/marketPersonality").MarketPersonalityId,
              label: a.label,
              score: a.score,
            })),
            asOfCandle: dec.timestamp,
            updatedAt: new Date().toISOString(),
          },
          price: lastPrice,
          tradeAligned: dec.actionable && dec.direction === p.preferredAction,
        });
        evaluatePersonality(id, tf, lastPrice);
      }
    }

    if (!plan || !dec.actionable) {
      if (prevActionable.current && lastPrice) {
        cancelActive(id, tf, lastPrice, "Decision flipped to WAIT — plan cancelled");
      }
      prevActionable.current = false;
      return;
    }
    prevActionable.current = true;
    const market = classifySymbol(meta?.symbol_code ?? "", meta?.name ?? "", "", meta?.exchange_code ?? "");
    upsertFromPlan({
      plan,
      decision: dec,
      symbolId: id,
      symbolCode: code,
      market,
      timeframe: tf,
    });
  }, [
    trackKey,
    lastPrice,
    upsertFromPlan,
    cancelActive,
    recordSignal,
    markPriceUpdate,
    recordMissed,
    evaluateMissedPrice,
    recordPersonality,
    evaluatePersonality,
    logValidation,
    tickValidation,
    validationEnabled,
    openPaper,
    paperPrice,
    paperEnabled,
    lateSession,
    candleItems,
    id,
    tf,
    meta,
    profile,
  ]);

  // End-of-session personality resolve (India cash close)
  useEffect(() => {
    if ((profile !== "intraday" && profile !== "scalping") || !id || !lastPrice) return;
    if (!isPastIndiaCashClose()) return;
    closePersonalitySession(id, tf, lastPrice);
  }, [profile, id, tf, lastPrice, closePersonalitySession]);

  // Expiry Intelligence snapshots + post-close review
  useEffect(() => {
    if (!expiryIntel.active || !symbolCode) return;
    const expiryDate = expiryIntel.schedule.expiryDate ?? todayIstYmd();
    saveExpirySnapshot(symbolCode, expiryDate, expiryIntel);

    if (!isPastIndiaCashClose()) return;
    const reviewKey = `${symbolCode}:${expiryDate}`;
    if (reviewFired.current === reviewKey) return;
    if (expiryReviews.some((r) => r.id === reviewKey)) {
      reviewFired.current = reviewKey;
      return;
    }
    generateExpiryReview({
      symbolCode,
      expiryDate,
      candles: candleItems,
      journal: journalEntries,
      intel: expiryIntel,
    });
    reviewFired.current = reviewKey;
  }, [
    expiryIntel,
    symbolCode,
    saveExpirySnapshot,
    generateExpiryReview,
    candleItems,
    journalEntries,
    expiryReviews,
  ]);

  const annotations = useMemo(() => {
    const lookup = (s: TradeSetup) => {
      const match = strategiesQ.data?.items.find((st) => st.required_setup_types.includes(s.setup_type));
      return match?.strategy_name ?? "Structure Confluence";
    };
    return buildAnnotations(decision, setupsQ.data?.items ?? [], lookup);
  }, [decision, setupsQ.data, strategiesQ.data]);

  const latestExpiryReview = useMemo(() => {
    if (!symbolCode) return null;
    const expiryDate = expiryIntel.schedule.expiryDate ?? todayIstYmd();
    return expiryReviews.find((r) => r.id === `${symbolCode}:${expiryDate}`) ?? null;
  }, [expiryReviews, symbolCode, expiryIntel.schedule.expiryDate]);

  const executionCard = useMemo(() => {
    if (!decision) return null;
    return deriveExecutionCard({
      decision,
      plan: predictive,
      timeframe: tf,
      lastPrice,
      levels: levelsQ.data ?? null,
      orderBlocks: obQ.data?.items,
      structure: structureQ.data ?? null,
    });
  }, [decision, predictive, tf, lastPrice, levelsQ.data, obQ.data?.items, structureQ.data]);

  const missedOpportunity = useMemo(() => {
    if (profile !== "intraday" && profile !== "scalping") return null;
    return missedDayReport();
  }, [missedDayReport, profile, decision.kind, decision.confidence, lastPrice]);

  const personalityLeaderboard = useMemo(() => {
    if (profile !== "intraday" && profile !== "scalping") return [];
    return bestPersonalitiesFn(3);
  }, [bestPersonalitiesFn, profile, missedOpportunity?.day]);

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
    profile,
    expiryIntel,
    expiryReview: latestExpiryReview,
    executionCard,
    missedOpportunity,
    personalityLeaderboard,
    lateSession,
    isLoading:
      trendQ.isLoading ||
      setupsQ.isLoading ||
      rec.isLoading ||
      candlesQ.isLoading ||
      mtfTrendQs.some((q) => q.isLoading),
  };
}
