/**
 * TradeMind AI Terminal — chart-first professional desk.
 * Presentation / layout only — no trading-logic changes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnalysisPanel } from "../components/analysis/AnalysisPanel";
import { ChartPane } from "../components/chart/ChartPane";
import { ChartToolbar } from "../components/chart/ChartToolbar";
import { DrawingToolbar } from "../components/chart/DrawingToolbar";
import { OverlayToggles } from "../components/chart/OverlayToggles";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { ChartRangeBar } from "../components/chart/ChartRangeBar";
import { LayoutPicker } from "../components/chart/LayoutPicker";
import { FloatingAiButton } from "../components/layout/FloatingAiButton";
import { DeskHeader } from "../components/layout/DeskHeader";
import { MarketStrip } from "../components/layout/MarketStrip";
import { DeskStatusBar } from "../components/layout/DeskStatusBar";
import { RightDeskPanel } from "../components/layout/RightDeskPanel";
import { PanelResizeHandle } from "../components/layout/PanelResizeHandle";
import { DeskBottomWorkspace } from "../components/desk/DeskBottomWorkspace";
import { WatchlistPanel } from "../components/desk/WatchlistPanel";
import { SymbolSearchModal } from "../components/markets/SymbolSearchModal";
import { ConnectionStatusChip } from "../components/shell/ConnectionStatus";
import { Badge } from "../components/common/primitives";
import { useDecision } from "../hooks/useDecision";
import { useCandles, useMarketQuote } from "../hooks/queries";
import { useSymbolMeta } from "../hooks/useSymbolMeta";
import { useUniverseSymbols } from "../hooks/useUniverseSymbols";
import { ApiError } from "../lib/apiClient";
import type { Timeframe } from "../lib/endpoints";
import { cx, fmtPrice, fmtSignedPct, num } from "../lib/format";
import { dataFreshness, resolvePrice } from "../lib/marketPrice";
import { sliceCandlesAtIndex } from "../lib/replayGuard";
import type { OverlayId } from "../lib/overlays";
import { displayCode } from "../lib/universe";
import { useDrawings } from "../store/drawings";
import { layoutGridClass, layoutPaneClass, useWorkspace, type DrawingToolId } from "../store/workspace";

export function TerminalPage() {
  const { symbolId = "" } = useParams();
  const navigate = useNavigate();
  const meta = useSymbolMeta(symbolId);

  const panes = useWorkspace((s) => s.panes);
  const layout = useWorkspace((s) => s.layout);
  const activePaneId = useWorkspace((s) => s.activePaneId);
  const aiPanelMode = useWorkspace((s) => s.aiPanelMode);
  const analysisMode = useWorkspace((s) => s.analysisMode);
  const rightPanelOpen = useWorkspace((s) => s.rightPanelOpen);
  const rightPanelWidth = useWorkspace((s) => s.rightPanelWidth);
  const rightPanelTab = useWorkspace((s) => s.rightPanelTab);
  const watchlistOpen = useWorkspace((s) => s.watchlistOpen);
  const watchlistWidth = useWorkspace((s) => s.watchlistWidth);
  const setWatchlistWidth = useWorkspace((s) => s.setWatchlistWidth);
  const setWatchlistOpen = useWorkspace((s) => s.setWatchlistOpen);
  const bottomOpen = useWorkspace((s) => s.bottomOpen);
  const bottomHeight = useWorkspace((s) => s.bottomHeight);
  const bottomTab = useWorkspace((s) => s.bottomTab);
  const setBottomHeight = useWorkspace((s) => s.setBottomHeight);
  const setBottomOpen = useWorkspace((s) => s.setBottomOpen);
  const syncPrimarySymbol = useWorkspace((s) => s.syncPrimarySymbol);
  const setAiPanelMode = useWorkspace((s) => s.setAiPanelMode);
  const setAnalysisMode = useWorkspace((s) => s.setAnalysisMode);
  const setPaneTimeframe = useWorkspace((s) => s.setPaneTimeframe);
  const setPaneOverlay = useWorkspace((s) => s.setPaneOverlay);
  const setPaneOverlays = useWorkspace((s) => s.setPaneOverlays);
  const setRightPanelWidth = useWorkspace((s) => s.setRightPanelWidth);
  const setRightPanelOpen = useWorkspace((s) => s.setRightPanelOpen);
  const openRightPanel = useWorkspace((s) => s.openRightPanel);
  const setDrawingTool = useWorkspace((s) => s.setDrawingTool);
  const toggleMagnet = useWorkspace((s) => s.toggleMagnet);
  const replayActive = useWorkspace((s) => s.replayActive);
  const replayIndex = useWorkspace((s) => s.replayIndex);
  const setReplayActive = useWorkspace((s) => s.setReplayActive);
  const setReplayIndex = useWorkspace((s) => s.setReplayIndex);
  const setDraft = useDrawings((s) => s.setDraft);

  const activePane = useMemo(
    () => panes.find((p) => p.id === activePaneId) ?? panes[0],
    [panes, activePaneId],
  );

  const isMobile = useIsMobile();
  const { ready: universeReady } = useUniverseSymbols();
  const routeQuote = useMarketQuote(symbolId || null);

  useEffect(() => {
    if (symbolId) syncPrimarySymbol(symbolId);
  }, [symbolId, syncPrimarySymbol]);

  useEffect(() => {
    const err = routeQuote.error;
    const missing =
      err instanceof ApiError &&
      (err.status === 422 || (err.status === 404 && err.message === symbolId));
    if (!missing) return;
    const nifty = universeReady.find((u) => u.code === "NIFTY50")?.lite?.id;
    if (nifty && nifty !== symbolId) navigate(`/terminal/${nifty}`, { replace: true });
  }, [routeQuote.error, universeReady, symbolId, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "s")) {
        e.preventDefault();
        useWorkspace.getState().setSymbolSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (isMobile && aiPanelMode === "strip") setAiPanelMode("hidden");
  }, [isMobile, aiPanelMode, setAiPanelMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Escape") {
        if (analysisMode) setAnalysisMode(false);
        else {
          setDrawingTool("cursor");
          setDraft(null);
        }
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setAnalysisMode(!analysisMode);
        return;
      }

      const map: Record<string, DrawingToolId> = {
        v: "cursor",
        V: "cursor",
        c: "crosshair",
        C: "crosshair",
        t: "trendline",
        T: "trendline",
        h: "hline",
        H: "hline",
        r: "rect",
        R: "rect",
        f: "fib",
        F: "fib",
      };
      if (map[e.key]) {
        e.preventDefault();
        setDrawingTool(map[e.key]);
        setDraft(null);
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMagnet();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [analysisMode, setAnalysisMode, setDrawingTool, setDraft, toggleMagnet]);

  useEffect(() => {
    document.documentElement.dataset.terminalFullscreen = analysisMode ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.terminalFullscreen;
    };
  }, [analysisMode]);

  const activeSymbolId = activePane?.symbolId || symbolId;
  const activeTf = (activePane?.timeframe ?? "15m") as Timeframe;
  const { decision } = useDecision(replayActive ? null : activeSymbolId || null, activeTf);
  const quoteQ = useMarketQuote(activeSymbolId || null);
  const candles = useCandles(activeSymbolId || null, activeTf);
  const allBars = candles.data?.items ?? [];
  const bars =
    replayActive && replayIndex != null
      ? sliceCandlesAtIndex(allBars, replayIndex)
      : allBars;

  useEffect(() => {
    if (replayActive && allBars.length && replayIndex == null) {
      setReplayIndex(Math.max(0, allBars.length - 40));
    }
  }, [replayActive, allBars.length, replayIndex, setReplayIndex]);

  const quote = quoteQ.data;
  const last = bars[bars.length - 1];
  const dayChange =
    quote?.day_change_pct ??
    (last && bars[bars.length - 2]
      ? ((num(last.close) - num(bars[bars.length - 2].close)) / num(bars[bars.length - 2].close)) *
        100
      : 0);
  const resolved = resolvePrice(replayActive ? null : quote ?? null, bars);
  const displayPrice = resolved.price != null ? fmtPrice(resolved.price) : last ? fmtPrice(num(last.close)) : "—";
  const symbolCode = displayCode(meta?.symbol_code ?? quote?.symbol_code);
  const exchangeHint =
    (meta?.exchange_code ?? "").toLowerCase() === "binance"
      ? "CRYPTO"
      : (meta?.exchange_code ?? "").toLowerCase() === "forex"
        ? "XAU"
        : "INDIA";
  const lastCandleOpenMs = last ? Date.parse(last.open_time) : null;
  const freshness = dataFreshness(
    resolved.asOfMs,
    activeTf,
    quote?.market_status ?? null,
    meta?.exchange_code ?? exchangeHint,
    {
      quoteSource: quote?.source ?? (resolved.source === "candle" ? "persisted_candles" : null),
      candleOpenMs: lastCandleOpenMs != null && Number.isFinite(lastCandleOpenMs) ? lastCandleOpenMs : null,
    },
  );

  const onOverlay = useCallback(
    (id: OverlayId, on: boolean) => {
      if (activePane) setPaneOverlay(activePane.id, id, on);
    },
    [activePane, setPaneOverlay],
  );

  const onApplyOverlays = useCallback(
    (next: Record<OverlayId, boolean>) => {
      if (activePane) setPaneOverlays(activePane.id, next);
    },
    [activePane, setPaneOverlays],
  );

  const chartGrid = (
    <div className={cx("grid h-full min-h-0 w-full gap-px bg-subtle/20", layoutGridClass(layout))}>
      {panes.map((pane, index) => (
        <div
          key={pane.id}
          className={cx("flex h-full min-h-0 min-w-0 flex-col bg-bg", layoutPaneClass(layout, index))}
        >
          <ChartPane
            pane={pane}
            compact={layout !== "1"}
            showToolbar={isMobile || analysisMode || layout !== "1"}
            replayBars={
              replayActive && pane.id === activePane?.id
                ? bars
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );

  const showRight = !isMobile && rightPanelOpen;
  const showLeftWatch = !isMobile && watchlistOpen;
  const showBottom = !isMobile && bottomOpen;
  const showMobileSheet =
    isMobile &&
    rightPanelOpen &&
    (rightPanelTab === "options" ||
      rightPanelTab === "ai" ||
      rightPanelTab === "journal" ||
      rightPanelTab === "watchlist" ||
      rightPanelTab === "depth" ||
      rightPanelTab === "orders" ||
      rightPanelTab === "positions" ||
      rightPanelTab === "portfolio" ||
      rightPanelTab === "ticket" ||
      rightPanelTab === "alerts");

  // —— Analysis Mode ——
  if (analysisMode) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-bg animate-fade-in">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle/30 px-3">
          <div className="min-w-0 truncate font-display text-sm font-semibold">{symbolCode}</div>
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
          <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">Focus Mode</span>
          <div className="flex-1" />
          {activePane && (
            <TimeframeSelector
              value={activeTf}
              onChange={(t) => setPaneTimeframe(activePane.id, t)}
              compact
            />
          )}
          {activePane && <OverlayToggles overlays={activePane.overlays} onChange={onOverlay} />}
          <LayoutPicker />
          <button type="button" className="btn-chip" onClick={() => setAnalysisMode(false)}>
            Exit
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1">
          {!isMobile && <DrawingToolbar symbolId={activeSymbolId} />}
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">{chartGrid}</div>
            {isMobile && activeSymbolId && <DrawingToolbar symbolId={activeSymbolId} mobile />}
          </div>
        </div>
        <FloatingAiButton decisionKind={decision?.kind} />
        <SymbolSearchModal />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-subtle bg-surface px-3 py-2 lg:hidden">
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => useWorkspace.getState().setSymbolSearchOpen(true)}
        >
          <div className="truncate font-display text-[15px] font-bold tracking-tight">{symbolCode}</div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[12px]">
            <span className="font-bold text-content">{displayPrice}</span>
            <span className={cx("font-semibold", dayChange >= 0 ? "text-bull" : "text-bear")}>
              {fmtSignedPct(dayChange)}
            </span>
            <span className={cx("text-[9px] font-bold", freshness.live ? "text-bull" : "text-faint")}>
              {freshness.live ? "LIVE ●" : freshness.label}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
          <ConnectionStatusChip compact />
        </div>
      </header>

      <div className="hidden lg:block">
        <DeskHeader
          symbolCode={symbolCode}
          price={displayPrice}
          dayChange={dayChange}
          freshnessLabel={freshness.label}
          live={!!freshness.live && !replayActive}
        />
        <MarketStrip activeCode={symbolCode} />
      </div>

      {activePane && (
        <ChartToolbar
          timeframe={activeTf}
          onTimeframe={(t) => setPaneTimeframe(activePane.id, t)}
          overlays={activePane.overlays}
          onOverlay={onOverlay}
          onApplyOverlays={onApplyOverlays}
          compact={isMobile}
        />
      )}

      {replayActive && allBars.length > 0 && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-subtle/40 bg-elevated/40 px-3">
          <span className="text-[10px] font-bold uppercase text-faint">Replay</span>
          <input
            type="range"
            className="min-w-0 flex-1"
            min={10}
            max={Math.max(10, allBars.length - 1)}
            value={replayIndex ?? allBars.length - 1}
            onChange={(e) => setReplayIndex(Number(e.target.value))}
          />
          <button type="button" className="btn-chip !text-[10px]" onClick={() => setReplayActive(false)}>
            Live
          </button>
          <span className="text-[10px] text-warn">AI paused — no future data</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {showLeftWatch && (
          <>
            <aside
              style={{ width: watchlistWidth }}
              className="hidden h-full shrink-0 flex-col border-r border-subtle bg-surface lg:flex"
            >
              <div className="flex h-8 items-center justify-between border-b border-subtle/40 px-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-faint">Watchlist</span>
                <button type="button" className="btn-chip !px-1.5 !text-[10px]" onClick={() => setWatchlistOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <WatchlistPanel activeSymbolId={activeSymbolId} />
              </div>
            </aside>
            <PanelResizeHandle onDrag={(dx) => setWatchlistWidth(watchlistWidth + dx)} />
          </>
        )}

        {!isMobile && <DrawingToolbar symbolId={activeSymbolId} />}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">{chartGrid}</div>
            {isMobile && activeSymbolId && <DrawingToolbar symbolId={activeSymbolId} mobile />}
          </div>
          {!isMobile && <ChartRangeBar />}

          {showBottom && activeSymbolId && (
            <>
              <div
                className="h-1.5 shrink-0 cursor-row-resize bg-subtle/30 hover:bg-brand/40"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startY = e.clientY;
                  const startH = bottomHeight;
                  const onMove = (ev: MouseEvent) => {
                    setBottomHeight(startH + (startY - ev.clientY));
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
                title="Resize bottom panel"
              />
              <DeskBottomWorkspace
                symbolId={activeSymbolId}
                timeframe={activeTf}
                symbolCode={meta?.symbol_code ?? quote?.symbol_code}
                height={bottomHeight}
              />
            </>
          )}

          <DeskStatusBar
            symbolCode={symbolCode}
            timeframe={activeTf}
            exchangeHint={exchangeHint}
            freshnessLabel={freshness.label}
            live={!!freshness.live && !replayActive}
            dataSource={quote?.reference_note ?? quote?.source}
            provider={quote?.provider ?? quote?.source}
            quoteUpdatedAt={quote?.last_updated ?? null}
            candleOpenAt={last?.open_time ?? null}
          />
        </div>

        {showRight && activeSymbolId && (
          <>
            <PanelResizeHandle onDrag={(dx) => setRightPanelWidth(rightPanelWidth - dx)} />
            <RightDeskPanel
              symbolId={activeSymbolId}
              timeframe={activeTf}
              symbolCode={meta?.symbol_code ?? quote?.symbol_code}
              width={rightPanelWidth}
            />
          </>
        )}

        {!isMobile && (
          <aside className="desk-side-rail hidden lg:flex" aria-label="Desk panels">
            {(
              [
                ["watchlist", "Watchlist"],
                ["ai", "Decision"],
                ["options", "Options"],
                ["orders", "Orders"],
                ["positions", "Positions"],
                ["depth", "Depth"],
                ["journal", "Journal"],
                ["alerts", "Alerts"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cx(
                  "desk-side-rail-btn",
                  id === "watchlist" && watchlistOpen && "desk-side-rail-btn-active",
                  id === "ai" && rightPanelOpen && rightPanelTab === "ai" && "desk-side-rail-btn-active",
                  id === "options" && bottomOpen && bottomTab === "options" && "desk-side-rail-btn-active",
                  id === "orders" && bottomOpen && bottomTab === "orders" && "desk-side-rail-btn-active",
                  id === "positions" && bottomOpen && bottomTab === "positions" && "desk-side-rail-btn-active",
                  id === "depth" && bottomOpen && bottomTab === "depth" && "desk-side-rail-btn-active",
                  id === "journal" && bottomOpen && bottomTab === "journal" && "desk-side-rail-btn-active",
                  id === "alerts" && bottomOpen && bottomTab === "alerts" && "desk-side-rail-btn-active",
                )}
                title={label}
                aria-label={label}
                onClick={() => {
                  if (id === "watchlist") {
                    setWatchlistOpen(!watchlistOpen);
                    return;
                  }
                  if (id === "options" || id === "depth" || id === "orders" || id === "positions" || id === "journal" || id === "alerts") {
                    const open =
                      (id === "options" && bottomOpen && bottomTab === "options") ||
                      (id === "depth" && bottomOpen && bottomTab === "depth") ||
                      (id === "orders" && bottomOpen && bottomTab === "orders") ||
                      (id === "positions" && bottomOpen && bottomTab === "positions") ||
                      (id === "journal" && bottomOpen && bottomTab === "journal") ||
                      (id === "alerts" && bottomOpen && bottomTab === "alerts");
                    if (open) setBottomOpen(false);
                    else useWorkspace.getState().openDeskWorkspace(id);
                    return;
                  }
                  if (rightPanelOpen && rightPanelTab === id) setRightPanelOpen(false);
                  else openRightPanel(id);
                }}
              >
                <RailIcon id={id} />
              </button>
            ))}
          </aside>
        )}
      </div>

      {showMobileSheet && activeSymbolId && (
        <div className="fixed inset-0 z-[55] lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-bg/55 backdrop-blur-[2px]"
            aria-label="Close panel"
            onClick={() => setRightPanelOpen(false)}
          />
          <div
            className={cx(
              "absolute inset-x-0 bottom-0 flex flex-col border border-subtle/60 bg-surface shadow-pop animate-slide-up pb-[env(safe-area-inset-bottom)]",
              rightPanelTab === "options" ? "inset-y-0 max-h-none rounded-none" : "max-h-[min(82vh,760px)] rounded-t-2xl",
            )}
          >
            <div className="relative flex shrink-0 items-center justify-center border-b border-subtle px-3 py-2.5">
              <div className="h-1 w-10 rounded-full bg-subtle" aria-hidden />
              <button
                type="button"
                className="btn-chip absolute right-3 top-1/2 -translate-y-1/2 !px-2.5"
                onClick={() => setRightPanelOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <RightDeskPanel
                symbolId={activeSymbolId}
                timeframe={activeTf}
                symbolCode={meta?.symbol_code ?? quote?.symbol_code}
                width={typeof window !== "undefined" ? window.innerWidth : 400}
              />
            </div>
          </div>
        </div>
      )}

      {isMobile && !rightPanelOpen && aiPanelMode === "full" && activeSymbolId && (
        <div className="fixed inset-0 z-[55] lg:hidden" role="dialog" aria-modal="true" aria-label="AI analysis">
          <button
            type="button"
            className="absolute inset-0 bg-bg/55 backdrop-blur-[2px]"
            aria-label="Close AI panel"
            onClick={() => setAiPanelMode("hidden")}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(78vh,720px)] flex-col rounded-t-2xl border border-subtle/60 bg-surface shadow-pop animate-slide-up pb-[env(safe-area-inset-bottom)]">
            <div className="relative flex shrink-0 items-center justify-center border-b border-subtle px-3 py-2.5">
              <div className="h-1 w-10 rounded-full bg-subtle" aria-hidden />
              <button
                type="button"
                className="btn-chip absolute right-3 top-1/2 -translate-y-1/2 !px-2.5"
                onClick={() => setAiPanelMode("hidden")}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <AnalysisPanel id={activeSymbolId} tf={activeTf} />
            </div>
          </div>
        </div>
      )}

      <FloatingAiButton decisionKind={decision?.kind} />
      <SymbolSearchModal />
    </div>
  );
}

function RailIcon({ id }: { id: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "watchlist") {
    return (
      <svg {...common}>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  }
  if (id === "ai") {
    return (
      <svg {...common}>
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
        <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
      </svg>
    );
  }
  if (id === "options") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  if (id === "orders") {
    return (
      <svg {...common}>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    );
  }
  if (id === "positions") {
    return (
      <svg {...common}>
        <path d="M4 19V5M4 19h16" />
        <path d="M8 15l4-5 3 3 5-7" />
      </svg>
    );
  }
  if (id === "depth") {
    return (
      <svg {...common}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    );
  }
  if (id === "journal") {
    return (
      <svg {...common}>
        <path d="M6 3h11a2 2 0 012 2v16H8a2 2 0 01-2-2V3z" />
        <path d="M6 3a2 2 0 00-2 2v14" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
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
