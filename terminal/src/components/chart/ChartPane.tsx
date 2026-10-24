/**
 * Chart pane V2 — independent symbol / TF / overlays / decision.
 * Same data hooks; new chrome only.
 */

import { useEffect, useMemo, useState } from "react";
import { OverlayToggles } from "./OverlayToggles";
import { TerminalChart, type OverlayData } from "./TerminalChart";
import { TimeframeSelector } from "./TimeframeSelector";
import { CardwellRsiPane } from "./CardwellRsiPane";
import { Badge, Spinner } from "../common/primitives";
import {
  useActiveSetups,
  useAnalysis,
  useCandles,
  useFvgs,
  useLevels,
  useMarketQuote,
  useOrderBlocks,
  useStructureEvents,
  useSweeps,
} from "../../hooks/queries";
import { useDecision } from "../../hooks/useDecision";
import { useEnsureMarketData } from "../../hooks/useEnsureMarketData";
import { useLiveStream } from "../../hooks/useLiveStream";
import { useChartGestureLock } from "../../hooks/useChartGestureLock";
import { useSymbolMeta } from "../../hooks/useSymbolMeta";
import type { Timeframe } from "../../lib/endpoints";
import { cx, fmtPrice, fmtSignedPct, num } from "../../lib/format";
import {
  candleAlignForExchange,
  candleCountdownSec,
  currentBarOpenMs,
  formatCountdown,
  mergeLiveFormingCandle,
  shouldAllowLiveBar,
} from "../../lib/liveCandle";
import { dataFreshness, resolvePrice, timeframeSeconds } from "../../lib/marketPrice";
import type { OverlayId } from "../../lib/overlays";
import { computeCardwellRsi } from "../../lib/cardwellRsi";
import type { Candle } from "../../lib/types";
import { classifySymbol } from "../../lib/markets";
import { usePrefs } from "../../store/prefs";
import { useWorkspace, type ChartPaneState } from "../../store/workspace";

const EMPTY_LIVE: Candle[] = [];

export function ChartPane({
  pane,
  compact = false,
  showToolbar = true,
  replayBars,
}: {
  pane: ChartPaneState;
  compact?: boolean;
  showToolbar?: boolean;
  /** When set, chart shows this slice instead of live candles (replay mode). */
  replayBars?: Candle[];
}) {
  const activePaneId = useWorkspace((s) => s.activePaneId);
  const setActivePane = useWorkspace((s) => s.setActivePane);
  const setPaneTimeframe = useWorkspace((s) => s.setPaneTimeframe);
  const setPaneOverlay = useWorkspace((s) => s.setPaneOverlay);
  const chartType = useWorkspace((s) => s.chartType);
  const setSymbolSearchOpen = useWorkspace((s) => s.setSymbolSearchOpen);
  const marketCategory = usePrefs((s) => s.marketCategory);

  const symbolId = pane.symbolId;
  const tf = pane.timeframe;
  const overlays = pane.overlays;
  const active = pane.id === activePaneId;
  const meta = useSymbolMeta(symbolId);
  // Prefer the symbol's exchange over the sidebar market pill — wrong category
  // was blocking NSE live tip merge (crypto default prefs).
  const streamMarket = meta
    ? classifySymbol(meta.symbol_code, meta.name, "", meta.exchange_code)
    : marketCategory;

  useLiveStream({
    symbolId,
    symbolCode: meta?.symbol_code,
    timeframe: tf,
    market: streamMarket,
    enabled: !!symbolId && active,
  });

  const candles = useCandles(symbolId || null, tf);
  const quoteQ = useMarketQuote(symbolId || null);
  const levels = useLevels(symbolId || null, tf);
  const events = useStructureEvents(symbolId || null, tf);
  const ob = useOrderBlocks(symbolId || null, tf);
  const fvg = useFvgs(symbolId || null, tf);
  const sweeps = useSweeps(symbolId || null, tf);
  const setups = useActiveSetups(symbolId || null, tf);
  const ema = useAnalysis(symbolId || null, tf, "ema", overlays.ema);
  const sma = useAnalysis(symbolId || null, tf, "sma", overlays.sma);
  const vwap = useAnalysis(symbolId || null, tf, "vwap", overlays.vwap);
  const ms = useAnalysis(
    symbolId || null,
    tf,
    "market_structure",
    overlays.bos ||
      overlays.choch ||
      overlays.hh ||
      overlays.hl ||
      overlays.lh ||
      overlays.ll ||
      overlays.marketStructure,
  );
  const { decision, annotations, predictive } = useDecision(symbolId || null, tf);

  const liveBars = candles.data?.items ?? EMPTY_LIVE;
  const lastBar = liveBars.length ? liveBars[liveBars.length - 1] : null;
  const staleMs = (timeframeSeconds(tf) * 1.25 + 45) * 1000;
  const lastOpenMs = lastBar ? Date.parse(lastBar.open_time) : NaN;
  const alignHint = candleAlignForExchange(meta?.exchange_code, streamMarket);
  const expectedOpen = currentBarOpenMs(tf, Date.now(), alignHint);
  const tipAgeMs = lastBar
    ? Date.now() - Date.parse(lastBar.close_time || lastBar.open_time)
    : 0;
  // Forming tips use a future close_time — also treat missing bars vs current open as stale.
  const gapBehind =
    !!lastBar &&
    Number.isFinite(lastOpenMs) &&
    expectedOpen != null &&
    lastOpenMs < expectedOpen - timeframeSeconds(tf) * 1000;
  const isStale =
    !!lastBar &&
    quoteQ.data?.market_status !== "CLOSED" &&
    (gapBehind || (tipAgeMs > 0 && tipAgeMs > staleMs));
  const needsFill =
    !!symbolId && !candles.isLoading && !candles.isFetching && (liveBars.length === 0 || isStale);
  useEnsureMarketData(symbolId || null, tf, needsFill);

  // Never invent demo OHLC — trading accuracy requires waiting for real API candles.
  const candlesPending =
    !!symbolId && liveBars.length === 0 && (candles.isLoading || candles.isFetching);
  const candlesFailed =
    !!symbolId && liveBars.length === 0 && !candles.isLoading && !candles.isFetching && (candles.isError || candles.isFetched);
  const candlesErrorMsg =
    candles.error instanceof Error
      ? candles.error.message
      : candles.isError
        ? "Candle request failed"
        : "No candles returned from API";

  // Countdown clock only — tip OHLC comes from the live stream / tip bus (no 250ms candle rebuild).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const candleAlign = candleAlignForExchange(meta?.exchange_code, streamMarket);
  const allowNewBar = shouldAllowLiveBar({
    market: streamMarket,
    exchangeCode: meta?.exchange_code,
    marketStatus: quoteQ.data?.market_status,
    nowMs,
  });

  const bars = useMemo(() => {
    if (replayBars?.length) return replayBars;
    if (!liveBars.length) return EMPTY_LIVE;
    const livePx = quoteQ.data?.current_price ?? resolvePrice(quoteQ.data ?? null, liveBars).price;
    return mergeLiveFormingCandle(liveBars, tf, livePx, nowMs, { allowNewBar, align: candleAlign });
  }, [replayBars, liveBars, quoteQ.data, tf, nowMs, allowNewBar, candleAlign]);

  const countdownSec =
    bars.length > 0 && allowNewBar ? candleCountdownSec(tf, nowMs, candleAlign) : null;
  const countdown = countdownSec != null ? formatCountdown(countdownSec) : null;

  const cardwell = useMemo(
    () => (overlays.cardwellRsi && bars.length ? computeCardwellRsi(bars) : null),
    [overlays.cardwellRsi, bars],
  );

  const swings = useMemo(() => {
    const items = ms.data?.items ?? [];
    return items
      .filter((b) => b.values.swing_type)
      .slice(-8)
      .map((b) => ({
        time: b.open_time,
        type: String(b.values.swing_type),
      }));
  }, [ms.data]);

  const resolved = useMemo(
    () => resolvePrice(quoteQ.data ?? null, liveBars.length ? liveBars : bars),
    [quoteQ.data, liveBars, bars],
  );

  const overlayData = useMemo<OverlayData>(
    () => ({
      ema: ema.data?.items,
      sma: sma.data?.items,
      vwap: vwap.data?.items,
      quote:
        quoteQ.data && resolved.price != null
          ? { ...quoteQ.data, current_price: resolved.price }
          : (quoteQ.data ?? null),
      orderBlocks: ob.data?.items,
      fvgs: fvg.data?.items,
      sweeps: sweeps.data?.items,
      levels: levels.data ?? null,
      events: events.data ?? null,
      setups: setups.data?.items,
      annotations,
      predictive,
      swings,
      cardwellRsi: cardwell,
      exchangeCode:
        meta?.exchange_code ??
        (marketCategory === "india"
          ? "nse"
          : marketCategory === "crypto"
            ? "binance"
            : marketCategory === "forex" || marketCategory === "commodities"
              ? "forex"
              : null),
    }),
    [
      ema.data,
      sma.data,
      vwap.data,
      quoteQ.data,
      resolved.price,
      ob.data,
      fvg.data,
      sweeps.data,
      levels.data,
      events.data,
      setups.data,
      annotations,
      predictive,
      swings,
      cardwell,
      meta?.exchange_code,
      marketCategory,
    ],
  );

  const quote = quoteQ.data;
  const last = bars[bars.length - 1];
  const dayChange =
    quote?.day_change_pct ??
    (last && bars[bars.length - 2]
      ? ((num(last.close) - num(bars[bars.length - 2].close)) / num(bars[bars.length - 2].close)) *
        100
      : 0);
  const displayPrice = resolved.price != null ? fmtPrice(resolved.price) : "—";
  const freshness = dataFreshness(
    resolved.asOfMs,
    tf,
    quote?.market_status ?? null,
    meta?.exchange_code,
    {
      quoteSource: quote?.source ?? (resolved.source === "candle" ? "persisted_candles" : null),
      candleOpenMs: Number.isFinite(lastOpenMs) ? lastOpenMs : null,
    },
  );

  const onOverlay = (id: OverlayId, on: boolean) => setPaneOverlay(pane.id, id, on);
  const gestureRef = useChartGestureLock(true);

  return (
    <div
      role="presentation"
      onMouseDown={() => setActivePane(pane.id)}
      className={cx(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden transition-shadow duration-200",
        active ? "ring-1 ring-inset ring-brand/35" : "ring-1 ring-inset ring-transparent",
      )}
    >
      {showToolbar && (
        <div
          className={cx(
            "flex shrink-0 items-center gap-2 border-b border-subtle/25 bg-surface/40 px-2 backdrop-blur-sm",
            compact ? "h-9" : "h-10",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate">
              <button
                type="button"
                className="truncate font-display text-[12px] font-bold text-content hover:text-brand"
                onClick={() => setSymbolSearchOpen(true)}
                title="Change symbol"
              >
                {meta?.symbol_code ?? quote?.symbol_code ?? "—"}
              </button>
              {!compact && (
                <span
                  className={cx(
                    "font-mono text-[11px] tabular-nums",
                    dayChange >= 0 ? "text-bull" : "text-bear",
                  )}
                >
                  {displayPrice} {fmtSignedPct(dayChange)}
                </span>
              )}
              {symbolId && bars.length > 0 && (
                <span
                  className={cx(
                    "rounded px-1 py-px text-[9px] font-semibold tracking-wide",
                    freshness.live
                      ? "text-bull"
                      : freshness.tone === "warn"
                        ? "text-warn"
                        : "text-faint",
                  )}
                >
                  {freshness.live ? "LIVE ●" : freshness.label}
                </span>
              )}
              {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
            </div>
          </div>
          {!compact && (
            <>
              <TimeframeSelector
                value={tf}
                onChange={(t) => setPaneTimeframe(pane.id, t as Timeframe)}
                compact
              />
              <OverlayToggles overlays={overlays} onChange={onOverlay} />
            </>
          )}
        </div>
      )}

      <div
        ref={gestureRef}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col chart-stage chart-gesture-surface"
      >
        {!symbolId ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            Select a symbol from Lists or Markets
          </div>
        ) : candlesPending && bars.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner label="Loading chart…" />
          </div>
        ) : candlesFailed && bars.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted">
            <div>Could not load candles from API.</div>
            <div className="text-[11px] text-faint">{candlesErrorMsg}</div>
            <button
              type="button"
              className="btn-chip mt-1"
              onClick={() => void candles.refetch()}
            >
              Retry
            </button>
          </div>
        ) : bars.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            Preparing chart…
          </div>
        ) : (
          <>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0">
                <TerminalChart
                  candles={bars}
                  enabled={overlays}
                  data={overlayData}
                  symbolId={symbolId}
                  symbolCode={meta?.symbol_code ?? quoteQ.data?.symbol_code ?? ""}
                  timeframe={tf}
                  countdown={countdown}
                  chartType={chartType}
                />
              </div>
            </div>
            {overlays.cardwellRsi && cardwell && <CardwellRsiPane state={cardwell} />}
          </>
        )}
      </div>
    </div>
  );
}
