/**
 * Chart pane V2 — independent symbol / TF / overlays / decision.
 * Same data hooks; new chrome only.
 */

import { useMemo } from "react";
import { OverlayToggles } from "./OverlayToggles";
import { PaneSymbolPicker } from "./PaneSymbolPicker";
import { TerminalChart, type OverlayData } from "./TerminalChart";
import { TimeframeSelector } from "./TimeframeSelector";
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
import { useSymbolMeta } from "../../hooks/useSymbolMeta";
import type { Timeframe } from "../../lib/endpoints";
import { cx, fmtPrice, fmtSignedPct, num } from "../../lib/format";
import { dataFreshness, resolvePrice, timeframeSeconds } from "../../lib/marketPrice";
import type { OverlayId } from "../../lib/overlays";
import { usePrefs } from "../../store/prefs";
import { useWorkspace, type ChartPaneState } from "../../store/workspace";

export function ChartPane({
  pane,
  compact = false,
  showToolbar = true,
}: {
  pane: ChartPaneState;
  compact?: boolean;
  showToolbar?: boolean;
}) {
  const activePaneId = useWorkspace((s) => s.activePaneId);
  const setActivePane = useWorkspace((s) => s.setActivePane);
  const setPaneTimeframe = useWorkspace((s) => s.setPaneTimeframe);
  const setPaneOverlay = useWorkspace((s) => s.setPaneOverlay);
  const marketCategory = usePrefs((s) => s.marketCategory);

  const symbolId = pane.symbolId;
  const tf = pane.timeframe;
  const overlays = pane.overlays;
  const active = pane.id === activePaneId;
  const meta = useSymbolMeta(symbolId);

  useLiveStream({
    symbolId,
    timeframe: tf,
    market: marketCategory,
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
    overlays.marketStructure || overlays.bos,
  );
  const { decision, annotations, predictive } = useDecision(symbolId || null, tf);

  const bars = candles.data?.items ?? [];
  const lastBar = bars.length ? bars[bars.length - 1] : null;
  const staleMs = (timeframeSeconds(tf) * 2 + 120) * 1000;
  const isStale =
    !!lastBar &&
    quoteQ.data?.market_status !== "CLOSED" &&
    Date.now() - Date.parse(lastBar.close_time || lastBar.open_time) > staleMs;
  const needsFill =
    !!symbolId && !candles.isLoading && !candles.isFetching && (bars.length === 0 || isStale);
  const ensure = useEnsureMarketData(symbolId || null, tf, needsFill);

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
    () => resolvePrice(quoteQ.data ?? null, candles.data?.items ?? []),
    [quoteQ.data, candles.data],
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
  const freshness = dataFreshness(resolved.asOfMs, tf, quote?.market_status ?? null);

  const onOverlay = (id: OverlayId, on: boolean) => setPaneOverlay(pane.id, id, on);

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
              <PaneSymbolPicker
                paneId={pane.id}
                symbolCode={meta?.symbol_code ?? quote?.symbol_code}
                compact={compact}
              />
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
                  {freshness.label}
                </span>
              )}
              {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
            </div>
          </div>
          <TimeframeSelector
            value={tf}
            onChange={(t) => setPaneTimeframe(pane.id, t as Timeframe)}
            compact
          />
          <OverlayToggles overlays={overlays} onChange={onOverlay} />
        </div>
      )}

      <div className="relative min-h-0 flex-1 chart-stage">
        {!symbolId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Select a symbol from Lists or Markets
          </div>
        ) : candles.isLoading || (ensure.isBusy && bars.length === 0) ? (
          <Spinner
            label={
              ensure.status === "downloading"
                ? "Downloading candles…"
                : ensure.status === "analyzing"
                  ? "Analyzing structure…"
                  : "Loading chart…"
            }
          />
        ) : ensure.status === "error" && bars.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted">
            <p>Could not load candles for {tf}.</p>
            <p className="text-[11px] text-faint">{ensure.error}</p>
          </div>
        ) : bars.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Preparing chart…
          </div>
        ) : (
          <TerminalChart candles={bars} enabled={overlays} data={overlayData} />
        )}
      </div>
    </div>
  );
}
