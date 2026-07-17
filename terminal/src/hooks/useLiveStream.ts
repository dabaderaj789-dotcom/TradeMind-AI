import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { resolveProvider, type StreamStatus } from "../lib/stream/providers";
import type { MarketId } from "../lib/markets";
import { qk } from "../lib/queryKeys";
import type { CandleList, MarketQuote } from "../lib/types";
import { useConnection } from "../store/connection";

/**
 * Keeps the terminal "live": health probing + light candle-tip updates,
 * with automatic reconnect and connection status for the UI.
 */
export function useLiveStream(opts: {
  symbolId: string | null;
  timeframe: string;
  market: MarketId;
  enabled?: boolean;
}) {
  const { symbolId, timeframe, market, enabled = true } = opts;
  const qc = useQueryClient();
  const setStatus = useConnection((s) => s.setStatus);
  const providerRef = useRef(resolveProvider(market));

  useEffect(() => {
    providerRef.current = resolveProvider(market);
  }, [market]);

  useEffect(() => {
    if (!enabled || !symbolId) {
      setStatus("disconnected", { error: null, market });
      return;
    }

    const provider = providerRef.current;
    setStatus("connecting", { provider: provider.label, market, error: null });

    const disconnect = provider.connect({
      symbolId,
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
        setStatus("live", { lastTickAt: tick.ts, error: null });
        // Soft-update the last candle close so the UI moves without a full refetch.
        // Never let a stale quote tick repaint a candle that is newer than the tick.
        qc.setQueryData<CandleList>(qk.candles(symbolId, timeframe), (prev) => {
          if (!prev?.items?.length) return prev;
          const items = [...prev.items];
          const last = { ...items[items.length - 1] };
          if (Number.isFinite(tick.ts) && tick.ts < Date.parse(last.open_time)) return prev;
          const px = tick.price;
          last.close = px;
          last.high = Math.max(Number(last.high), px);
          last.low = Math.min(Number(last.low), px);
          items[items.length - 1] = last;
          return { ...prev, items };
        });
        qc.setQueryData<MarketQuote>(qk.quote(symbolId), (prev) => {
          if (!prev) return prev;
          if (Number.isFinite(tick.ts) && tick.ts < Date.parse(prev.last_updated)) return prev;
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
            last_updated: new Date(tick.ts).toISOString(),
          };
        });
      },
    });

    // Background refetch for analysis freshness (no manual refresh required).
    const refetch = setInterval(() => {
      void qc.invalidateQueries({ queryKey: qk.candles(symbolId, timeframe) });
      void qc.invalidateQueries({ queryKey: qk.quote(symbolId) });
      void qc.invalidateQueries({ queryKey: qk.trend(symbolId, timeframe) });
      void qc.invalidateQueries({ queryKey: qk.activeSetups(symbolId, timeframe) });
    }, 20_000);

    return () => {
      disconnect();
      clearInterval(refetch);
    };
  }, [symbolId, timeframe, market, enabled, qc, setStatus]);
}
