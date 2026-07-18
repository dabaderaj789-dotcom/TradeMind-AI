/**
 * TradeMind AI Terminal V4 — premium professional trading desk.
 * Drawing toolbar · collapsible/resizable panels · floating AI · analysis fullscreen.
 * No trading-logic / backend changes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnalysisPanel } from "../components/analysis/AnalysisPanel";
import { ChartPane } from "../components/chart/ChartPane";
import { DrawingToolbar } from "../components/chart/DrawingToolbar";
import { OverlayToggles } from "../components/chart/OverlayToggles";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { FloatingAiButton } from "../components/layout/FloatingAiButton";
import { PanelResizeHandle } from "../components/layout/PanelResizeHandle";
import { WatchlistDrawer } from "../components/layout/WatchlistDrawer";
import { ConnectionStatusChip } from "../components/shell/ConnectionStatus";
import { TopBarActions } from "../components/layout/TopBarActions";
import { Badge } from "../components/common/primitives";
import { useDecision } from "../hooks/useDecision";
import { useCandles, useMarketQuote } from "../hooks/queries";
import { useSymbolMeta } from "../hooks/useSymbolMeta";
import type { Timeframe } from "../lib/endpoints";
import { cx, fmtPrice, fmtSignedPct, num } from "../lib/format";
import { dataFreshness, resolvePrice } from "../lib/marketPrice";
import type { OverlayId } from "../lib/overlays";
import { displayCode } from "../lib/universe";
import { useWorkspace } from "../store/workspace";

export function TerminalPage() {
  const { symbolId = "" } = useParams();
  const meta = useSymbolMeta(symbolId);

  const panes = useWorkspace((s) => s.panes);
  const activePaneId = useWorkspace((s) => s.activePaneId);
  const aiPanelOpen = useWorkspace((s) => s.aiPanelOpen);
  const watchlistOpen = useWorkspace((s) => s.watchlistOpen);
  const fullscreen = useWorkspace((s) => s.fullscreen);
  const analysisFullscreen = useWorkspace((s) => s.analysisFullscreen);
  const watchlistWidth = useWorkspace((s) => s.watchlistWidth);
  const aiPanelWidth = useWorkspace((s) => s.aiPanelWidth);
  const syncPrimarySymbol = useWorkspace((s) => s.syncPrimarySymbol);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);
  const toggleWatchlist = useWorkspace((s) => s.toggleWatchlist);
  const setFullscreen = useWorkspace((s) => s.setFullscreen);
  const setAnalysisFullscreen = useWorkspace((s) => s.setAnalysisFullscreen);
  const setPaneTimeframe = useWorkspace((s) => s.setPaneTimeframe);
  const setPaneOverlay = useWorkspace((s) => s.setPaneOverlay);
  const setLayout = useWorkspace((s) => s.setLayout);
  const setWatchlistWidth = useWorkspace((s) => s.setWatchlistWidth);
  const setAiPanelWidth = useWorkspace((s) => s.setAiPanelWidth);

  const activePane = useMemo(
    () => panes.find((p) => p.id === activePaneId) ?? panes[0],
    [panes, activePaneId],
  );

  const isMobile = useIsMobile();

  useEffect(() => {
    if (symbolId) syncPrimarySymbol(symbolId);
  }, [symbolId, syncPrimarySymbol]);

  useEffect(() => {
    setLayout("1");
  }, [setLayout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (analysisFullscreen) setAnalysisFullscreen(false);
        else if (fullscreen) setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, analysisFullscreen, setFullscreen, setAnalysisFullscreen]);

  useEffect(() => {
    document.documentElement.dataset.terminalFullscreen =
      fullscreen || analysisFullscreen ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.terminalFullscreen;
    };
  }, [fullscreen, analysisFullscreen]);

  const activeSymbolId = activePane?.symbolId || symbolId;
  const activeTf = (activePane?.timeframe ?? "15m") as Timeframe;
  const { decision, predictive } = useDecision(activeSymbolId || null, activeTf);
  const quoteQ = useMarketQuote(activeSymbolId || null);
  const candles = useCandles(activeSymbolId || null, activeTf);
  const bars = candles.data?.items ?? [];
  const quote = quoteQ.data;
  const last = bars[bars.length - 1];
  const dayChange =
    quote?.day_change_pct ??
    (last && bars[bars.length - 2]
      ? ((num(last.close) - num(bars[bars.length - 2].close)) / num(bars[bars.length - 2].close)) *
        100
      : 0);
  const resolved = resolvePrice(quote ?? null, bars);
  const displayPrice = resolved.price != null ? fmtPrice(resolved.price) : "—";
  const freshness = dataFreshness(resolved.asOfMs, activeTf, quote?.market_status ?? null);
  const symbolCode = displayCode(meta?.symbol_code ?? quote?.symbol_code);
  const exchangeHint =
    (meta?.exchange_code ?? "").toLowerCase() === "binance" ? "CRYPTO" : "INDIA";

  const onOverlay = useCallback(
    (id: OverlayId, on: boolean) => {
      if (activePane) setPaneOverlay(activePane.id, id, on);
    },
    [activePane, setPaneOverlay],
  );

  const chartGrid = (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 bg-bg">
      {activePane && (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <ChartPane pane={activePane} compact={false} showToolbar={isMobile || fullscreen} />
        </div>
      )}
    </div>
  );

  const freshnessChip = bars.length > 0 && (
    <span
      className={cx(
        "rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em]",
        freshness.live
          ? "bg-bull/10 text-bull"
          : freshness.tone === "warn"
            ? "bg-warn/10 text-warn"
            : "bg-elevated text-faint",
      )}
    >
      {freshness.label}
    </span>
  );

  // —— Analysis fullscreen (Bloomberg desk) ——
  if (analysisFullscreen && activeSymbolId) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-bg animate-fade-in">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-subtle/40 bg-surface px-4">
          <div className="font-display text-sm font-semibold">{symbolCode} · Analysis</div>
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
          <div className="flex-1" />
          <button type="button" className="btn-chip" onClick={() => setAnalysisFullscreen(false)}>
            Exit fullscreen
          </button>
        </div>
        <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-hidden border-x border-subtle/30">
          <AnalysisPanel id={activeSymbolId} tf={activeTf} />
        </div>
      </div>
    );
  }

  // —— Chart fullscreen ——
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-bg animate-fade-in">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle/30 px-3">
          <div className="min-w-0 truncate font-display text-sm font-semibold">{symbolCode}</div>
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
          <div className="flex-1" />
          {activePane && (
            <TimeframeSelector
              value={activeTf}
              onChange={(t) => setPaneTimeframe(activePane.id, t)}
              compact
            />
          )}
          {activePane && <OverlayToggles overlays={activePane.overlays} onChange={onOverlay} />}
          <button type="button" className="btn-chip" onClick={() => setFullscreen(false)}>
            Exit
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          {!isMobile && <DrawingToolbar symbolId={activeSymbolId} />}
          <div className="min-h-0 flex-1">{chartGrid}</div>
        </div>
        <FloatingAiButton decisionKind={decision?.kind} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg">
      {/* Mobile header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-subtle/30 bg-surface px-3 py-2.5 lg:hidden">
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-semibold tracking-tight">{symbolCode}</div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[12px]">
            <span className="font-semibold text-content">{displayPrice}</span>
            <span className={dayChange >= 0 ? "text-bull" : "text-bear"}>{fmtSignedPct(dayChange)}</span>
            {freshnessChip}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
          <ConnectionStatusChip compact />
        </div>
      </header>

      {/* Desktop command bar */}
      <header className="hidden h-12 shrink-0 items-center gap-3 border-b border-subtle/35 bg-surface/95 px-3 lg:flex">
        <div className="flex min-w-0 items-center gap-3">
          {!watchlistOpen && (
            <button type="button" className="btn-chip" title="Show watchlist" onClick={toggleWatchlist}>
              Markets
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[15px] font-semibold tracking-tight">{symbolCode}</h1>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                {exchangeHint}
              </span>
              <ConnectionStatusChip />
              {quote?.market_status && (
                <Badge tone={quote.market_status === "OPEN" ? "bull" : "neutral"}>
                  {quote.market_status}
                </Badge>
              )}
              {freshnessChip}
              {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
            </div>
          </div>
          <div className="flex items-baseline gap-2 border-l border-subtle/30 pl-3">
            <span className="font-mono text-[17px] font-semibold tabular-nums text-content">
              {displayPrice}
            </span>
            <span className={cx("font-mono text-xs tabular-nums", dayChange >= 0 ? "text-bull" : "text-bear")}>
              {fmtSignedPct(dayChange)}
            </span>
          </div>
          {predictive && decision?.actionable && (
            <div className="hidden items-center gap-2 border-l border-subtle/30 pl-3 xl:flex">
              <span
                className={cx(
                  "text-[11px] font-semibold",
                  predictive.direction === "buy" ? "text-bull" : "text-bear",
                )}
              >
                {predictive.label}
              </span>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {activePane && (
            <TimeframeSelector
              value={activeTf}
              onChange={(t) => setPaneTimeframe(activePane.id, t)}
            />
          )}
          {activePane && <OverlayToggles overlays={activePane.overlays} onChange={onOverlay} />}
          <button
            type="button"
            className={cx("btn-chip", aiPanelOpen && "btn-chip-active")}
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
          >
            AI
          </button>
          <button type="button" className="btn-chip" onClick={() => setFullscreen(true)}>
            Fullscreen
          </button>
          <TopBarActions />
        </div>
      </header>

      {/* Mobile TF strip */}
      <div className="flex shrink-0 items-center gap-2 border-b border-subtle/25 px-2 py-1.5 lg:hidden">
        {activePane && (
          <TimeframeSelector
            value={activeTf}
            onChange={(t) => setPaneTimeframe(activePane.id, t)}
            compact
          />
        )}
        <div className="flex-1" />
        {activePane && <OverlayToggles overlays={activePane.overlays} onChange={onOverlay} />}
      </div>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {!isMobile && watchlistOpen && (
          <>
            <WatchlistDrawer width={watchlistWidth} />
            <PanelResizeHandle onDrag={(dx) => setWatchlistWidth(watchlistWidth + dx)} />
          </>
        )}

        {!isMobile && <DrawingToolbar symbolId={activeSymbolId} />}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{chartGrid}</div>

        {!isMobile && aiPanelOpen && activeSymbolId && (
          <>
            <PanelResizeHandle
              onDrag={(dx) => setAiPanelWidth(aiPanelWidth - dx)}
            />
            <aside
              style={{ width: aiPanelWidth }}
              className="hidden shrink-0 flex-col border-l border-subtle/35 lg:flex animate-slide-in-right"
            >
              <AnalysisPanel id={activeSymbolId} tf={activeTf} />
            </aside>
          </>
        )}
      </div>

      {/* Mobile AI sheet */}
      {isMobile && aiPanelOpen && activeSymbolId && (
        <div className="max-h-[48vh] shrink-0 overflow-hidden border-t border-subtle/30 bg-surface animate-slide-in-right lg:hidden">
          <AnalysisPanel id={activeSymbolId} tf={activeTf} />
        </div>
      )}

      <FloatingAiButton decisionKind={decision?.kind} />
    </div>
  );
}

function useIsMobile() {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return matches;
}
