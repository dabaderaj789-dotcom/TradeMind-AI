/**
 * Ensures candles + SMC analysis exist for a symbol/timeframe.
 * On every symbol/timeframe open or switch: refresh quote + incremental candles.
 * Uses existing FastAPI download/execute endpoints — no engine changes.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { endpoints } from "../lib/endpoints";
import { qk } from "../lib/queryKeys";

const ANALYSIS_PLUGINS = [
  { plugin_id: "ema" },
  { plugin_id: "sma" },
  { plugin_id: "vwap" },
  { plugin_id: "rsi" },
  { plugin_id: "macd" },
  { plugin_id: "atr" },
  { plugin_id: "market_structure" },
  { plugin_id: "order_blocks" },
  { plugin_id: "fair_value_gaps" },
  { plugin_id: "liquidity_sweeps" },
];

export type EnsureStatus = "idle" | "downloading" | "analyzing" | "ready" | "error";

const inFlight = new Map<string, Promise<void>>();
// Stale-data refreshes must not loop when the provider has nothing newer
// (weekend equity sessions, provider lag) — enforce a per-key cooldown.
const lastCompleted = new Map<string, number>();
const ENSURE_COOLDOWN_MS = 90_000;

async function runEnsure(
  symbolId: string,
  timeframe: string,
  opts: { fullAnalysis: boolean } = { fullAnalysis: true },
): Promise<void> {
  await endpoints.downloadCandles({
    symbol_id: symbolId,
    timeframe,
    incremental: true,
  });

  if (!opts.fullAnalysis) return;

  await endpoints.executeAnalysis({
    symbol_id: symbolId,
    timeframe,
    plugins: ANALYSIS_PLUGINS,
    candle_limit: 800,
    persist: true,
  });

  const soft = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* SMC execute may 404 until candles land — soft-fail */
    }
  };

  await soft(() =>
    endpoints.executeMarketStructure({ symbol_id: symbolId, timeframe, persist: true }),
  );
  await soft(() => endpoints.executeOrderBlocks({ symbol_id: symbolId, timeframe, persist: true }));
  await soft(() => endpoints.executeFvgs({ symbol_id: symbolId, timeframe, persist: true }));
  await soft(() => endpoints.executeSweeps({ symbol_id: symbolId, timeframe, persist: true }));
  await soft(() =>
    endpoints.executeTradeSetups({
      symbol_id: symbolId,
      timeframe,
      ensure_analysis: true,
      incremental: false,
    }),
  );
}

export function useEnsureMarketData(
  symbolId: string | null,
  timeframe: string,
  needsFill: boolean,
) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<EnsureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef("");
  const openedKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!symbolId) return;

    const key = `${symbolId}:${timeframe}`;
    const firstOpen = !openedKeys.current.has(key);
    const cool = Date.now() - (lastCompleted.get(key) ?? 0) < ENSURE_COOLDOWN_MS;
    const shouldRun = firstOpen || (needsFill && !cool);

    if (!shouldRun) {
      setStatus((s) => (s === "error" ? s : "ready"));
      return;
    }
    if (lastKey.current === key && (status === "downloading" || status === "analyzing")) return;
    lastKey.current = key;
    openedKeys.current.add(key);

    let cancelled = false;

    const run = async () => {
      setStatus("downloading");
      setError(null);
      // Always pull a fresh quote when the chart opens / switches.
      void qc.invalidateQueries({ queryKey: qk.quote(symbolId) });
      try {
        let pending = inFlight.get(key);
        if (!pending) {
          pending = runEnsure(symbolId, timeframe, { fullAnalysis: true }).finally(() =>
            inFlight.delete(key),
          );
          inFlight.set(key, pending);
        }
        setStatus("analyzing");
        await pending;
        lastCompleted.set(key, Date.now());
        if (cancelled) return;
        await Promise.all([
          qc.invalidateQueries({ queryKey: qk.quote(symbolId) }),
          qc.invalidateQueries({ queryKey: qk.candles(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: qk.trend(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: qk.levels(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: qk.events(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: qk.orderBlocks(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: qk.fvgs(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: qk.sweeps(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: qk.activeSetups(symbolId, timeframe) }),
          qc.invalidateQueries({ queryKey: ["analysis", symbolId, timeframe] }),
        ]);
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Failed to load market data");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by symbol/tf/needsFill
  }, [symbolId, timeframe, needsFill, qc]);

  return { status, error, isBusy: status === "downloading" || status === "analyzing" };
}
