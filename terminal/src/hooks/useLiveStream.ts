import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { resolveProvider, type StreamStatus } from "../lib/stream/providers";
import type { MarketId } from "../lib/markets";
import {
  candleAlignForExchange,
  mergeLiveFormingCandle,
  shouldAllowLiveBar,
} from "../lib/liveCandle";
import { publishChartTip } from "../lib/chartTipBus";
import { qk } from "../lib/queryKeys";
import type { CandleList, MarketQuote } from "../lib/types";
import { useConnection } from "../store/connection";
import { useLatencyLab } from "../store/latencyLab";
import { endpoints } from "../lib/endpoints";
import { num } from "../lib/format";

/**
 * V7 live engine: ticks → tip bus + forming candle (no full chart rebuild).
 */
export function useLiveStream(opts: {
  symbolId: string | null;
  symbolCode?: string | null;
  timeframe: string;
  market: MarketId;
  enabled?: boolean;
}) {
  const { symbolId, symbolCode, timeframe, market, enabled = true } = opts;
  const qc = useQueryClient();
  const setStatus = useConnection((s) => s.setStatus);
  const pushLatency = useLatencyLab((s) => s.push);
  const providerRef = useRef(resolveProvider(market));
  const lastPriceRef = useRef<number | null>(null);

  useEffect(() => {
    providerRef.current = resolveProvider(market);
  }, [market]);

  useEffect(() => {
    if (!enabled || !symbolId) {
      setStatus("disconnected", { error: null, market });
      return;
    }

    const provider = resolveProvider(market);
    setStatus("connecting", { provider: provider.label, market, error: null });

    const disconnect = provider.connect({
      symbolId,
      symbolCode: symbolCode || undefined,
      timeframe,
      onStatus: (status: StreamStatus, detail?: string) => {
        setStatus(status, {
          provider: provider.label,
          market,
          error: status === "disconnected" ? detail ?? "Connection lost" : null,
          lastTickAt: status === "live" ? Date.now() : undefined,
        });
      },
      onTick: (tick) => {
        const received = tick.frontendReceivedAt ?? Date.now();
        setStatus("live", { lastTickAt: received, error: null });
        lastPriceRef.current = tick.price;

        publishChartTip({
          symbolId,
          price: tick.price,
          ts: tick.ts,
          volume: tick.volume,
          providerTs: tick.providerTs,
          frontendReceivedAt: received,
          source: tick.source,
        });

        pushLatency({
          symbolId,
          price: tick.price,
          source: tick.source,
          providerTs: tick.providerTs,
          backendSentAt: tick.backendSentAt,
          frontendReceivedAt: received,
          feedDelayMs: tick.feedDelayMs,
          backendDelayMs: tick.backendDelayMs,
          bottleneck: tick.bottleneck,
        });

        const quote = qc.getQueryData<MarketQuote>(qk.quote(symbolId));
        const now = received;
        const exchangeCode =
          market === "india"
            ? "nse"
            : market === "crypto"
              ? "binance"
              : market === "forex" || market === "commodities"
                ? "forex"
                : null;
        const allowNewBar = shouldAllowLiveBar({
          market,
          exchangeCode,
          marketStatus: quote?.market_status,
          nowMs: now,
        });
        const align = candleAlignForExchange(exchangeCode, market);

        qc.setQueryData<CandleList>(qk.candles(symbolId, timeframe), (prev) => {
          if (!prev?.items?.length) return prev;
          const merged = mergeLiveFormingCandle(prev.items, timeframe, tick.price, now, {
            allowNewBar,
            align,
          });
          // Apply trade volume onto forming tip when present (crypto WS).
          if (tick.volume != null && merged.length) {
            const tip = merged[merged.length - 1];
            merged[merged.length - 1] = {
              ...tip,
              volume: num(tip.volume) + (tick.volume || 0),
            };
          }
          return { ...prev, items: merged, total: Math.max(prev.total, merged.length) };
        });

        qc.setQueryData<MarketQuote>(qk.quote(symbolId), (prev) => {
          if (!prev) return prev;
          const prevTs = Date.parse(prev.last_updated);
          const tickTs = Number.isFinite(tick.ts) ? tick.ts : now;
          const prevIsFuture = Number.isFinite(prevTs) && prevTs > Date.now() + 2_000;
          if (!prevIsFuture && Number.isFinite(prevTs) && tickTs < prevTs) return prev;
          const px = tick.price;
          const dayChange = px - prev.prev_close;
          const dayChangePct = prev.prev_close ? (dayChange / prev.prev_close) * 100 : 0;
          return {
            ...prev,
            current_price: px,
            day_high: Math.max(prev.day_high, px),
            day_low: Math.min(prev.day_low, px),
            day_change: dayChange,
            day_change_pct: dayChangePct,
            last_updated: new Date(tickTs).toISOString(),
            source: tick.source || prev.source,
          };
        });
      },
    });

    const refetchQuote = setInterval(() => {
      void qc.invalidateQueries({ queryKey: qk.quote(symbolId) });
    }, market === "india" ? 2_000 : 5_000);

    const candleRefresh = setInterval(() => {
      void qc.invalidateQueries({ queryKey: qk.candles(symbolId, timeframe) });
    }, market === "india" ? 10_000 : 30_000);

    const download = setInterval(() => {
      void endpoints
        .downloadCandles({ symbol_id: symbolId, timeframe, incremental: true })
        .then(() => {
          // Re-merge tip after download so server OHLC does not freeze the wick.
          const px = lastPriceRef.current;
          void qc.invalidateQueries({ queryKey: qk.candles(symbolId, timeframe) }).then(() => {
            if (px == null) return;
            qc.setQueryData<CandleList>(qk.candles(symbolId, timeframe), (prev) => {
              if (!prev?.items?.length) return prev;
              const quote = qc.getQueryData<MarketQuote>(qk.quote(symbolId));
              const align = candleAlignForExchange(
                market === "india" ? "nse" : market === "crypto" ? "binance" : null,
                market,
              );
              const merged = mergeLiveFormingCandle(prev.items, timeframe, px, Date.now(), {
                allowNewBar: shouldAllowLiveBar({
                  market,
                  marketStatus: quote?.market_status,
                  nowMs: Date.now(),
                }),
                align,
              });
              return { ...prev, items: merged };
            });
          });
        })
        .catch(() => undefined);
    }, market === "india" ? 12_000 : 30_000);

    void endpoints
      .downloadCandles({ symbol_id: symbolId, timeframe, incremental: true })
      .then(() => qc.invalidateQueries({ queryKey: qk.candles(symbolId, timeframe) }))
      .catch(() => undefined);

    return () => {
      disconnect();
      clearInterval(refetchQuote);
      clearInterval(candleRefresh);
      clearInterval(download);
    };
  }, [symbolId, symbolCode, timeframe, market, enabled, qc, setStatus, pushLatency]);
}
