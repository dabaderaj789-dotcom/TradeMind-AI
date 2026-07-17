/**
 * Trading Terminal — chart-first professional workspace.
 * Multi-layout charts, fullscreen, auto market-data fill. No trading-engine changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnalysisPanel } from "../components/analysis/AnalysisPanel";
import { ChartPane } from "../components/chart/ChartPane";
import { LayoutPicker } from "../components/chart/LayoutPicker";
import { OverlayToggles } from "../components/chart/OverlayToggles";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { BottomPanel } from "../components/bottom/BottomPanel";
import { ConnectionStatusChip } from "../components/shell/ConnectionStatus";
import { TopBarActions } from "../components/layout/TopBarActions";
import { Badge } from "../components/common/primitives";
import { useDecision } from "../hooks/useDecision";
import { useCandles, useMarketQuote } from "../hooks/queries";
import { useSymbolMeta } from "../hooks/useSymbolMeta";
import type { Timeframe } from "../lib/endpoints";
import { cx, fmtPrice, fmtSignedPct, num } from "../lib/format";
import type { OverlayId } from "../lib/overlays";
import { MARKETS } from "../lib/markets";
import { usePrefs } from "../store/prefs";
import { layoutGridClass, useWorkspace } from "../store/workspace";

export function TerminalPage() {
  const { symbolId = "" } = useParams();
  const meta = useSymbolMeta(symbolId);
  const marketCategory = usePrefs((s) => s.marketCategory);

  const layout = useWorkspace((s) => s.layout);
  const panes = useWorkspace((s) => s.panes);
  const activePaneId = useWorkspace((s) => s.activePaneId);
  const aiPanelOpen = useWorkspace((s) => s.aiPanelOpen);
  const bottomOpen = useWorkspace((s) => s.bottomOpen);
  const fullscreen = useWorkspace((s) => s.fullscreen);
  const syncPrimarySymbol = useWorkspace((s) => s.syncPrimarySymbol);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);
  const setBottomOpen = useWorkspace((s) => s.setBottomOpen);
  const setFullscreen = useWorkspace((s) => s.setFullscreen);
  const setPaneTimeframe = useWorkspace((s) => s.setPaneTimeframe);
  const setPaneOverlay = useWorkspace((s) => s.setPaneOverlay);
  const setActivePane = useWorkspace((s) => s.setActivePane);

  const activePane = useMemo(
    () => panes.find((p) => p.id === activePaneId) ?? panes[0],
    [panes, activePaneId],
  );

  const isMobile = useIsMobile();

  useEffect(() => {
    if (symbolId) syncPrimarySymbol(symbolId);
  }, [symbolId, syncPrimarySymbol]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, setFullscreen]);

  useEffect(() => {
    document.documentElement.dataset.terminalFullscreen = fullscreen ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.terminalFullscreen;
    };
  }, [fullscreen]);

  const activeSymbolId = activePane?.symbolId || symbolId;
  const activeTf = (activePane?.timeframe ?? "1h") as Timeframe;
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
  const displayPrice = quote ? fmtPrice(quote.current_price) : last ? fmtPrice(last.close) : "—";
  const marketLabel = MARKETS.find((m) => m.id === marketCategory)?.label ?? "Market";
  const multi = layout !== "1";
  const compactPanes = layout === "6" || layout === "8";

  const onOverlay = useCallback(
    (id: OverlayId, on: boolean) => {
      if (activePane) setPaneOverlay(activePane.id, id, on);
    },
    [activePane, setPaneOverlay],
  );

  const swipeRef = useSwipePanes(panes.map((p) => p.id), activePaneId, setActivePane, isMobile && panes.length > 1);

  // Mobile: one chart at a time (avoids mounting 6–8 charts). Desktop: full layout grid.
  const visiblePanes = isMobile
    ? panes.filter((p) => p.id === activePaneId).length
      ? panes.filter((p) => p.id === activePaneId)
      : panes.slice(0, 1)
    : panes;

  const chartGrid = (
    <div
      ref={swipeRef}
      className={cx(
        "grid min-h-0 flex-1 gap-1.5",
        isMobile ? "grid-cols-1 grid-rows-1" : layoutGridClass(layout),
      )}
    >
      {visiblePanes.map((pane) => (
        <div key={pane.id} className="flex h-full min-h-0 min-w-0 flex-col">
          <ChartPane
            pane={pane}
            compact={isMobile ? false : compactPanes || multi}
            showToolbar={isMobile || multi || fullscreen}
          />
        </div>
      ))}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle/30 px-3">
          <div className="min-w-0 truncate text-sm font-semibold text-content">
            {meta?.symbol_code ?? quote?.symbol_code ?? activePane?.symbolId ?? "Chart"}
          </div>
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
          {predictive && <Badge tone={predictive.stateTone}>{predictive.state}</Badge>}
          <div className="flex-1" />
          {activePane && (
            <TimeframeSelector
              value={activeTf}
              onChange={(t) => setPaneTimeframe(activePane.id, t)}
              compact
            />
          )}
          {activePane && <OverlayToggles overlays={activePane.overlays} onChange={onOverlay} />}
          {!isMobile && <LayoutPicker />}
          <ConnectionStatusChip compact />
          <button
            type="button"
            className="btn-chip"
            onClick={() => setFullscreen(false)}
            title="Exit fullscreen (Esc)"
          >
            Exit
          </button>
        </div>
        <div className="min-h-0 flex-1 p-1">{chartGrid}</div>
        {isMobile && panes.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-3 pt-1">
            {panes.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Chart ${p.id}`}
                className={cx(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  p.id === activePaneId ? "bg-brand" : "bg-subtle",
                )}
                onClick={() => setActivePane(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* Mobile header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-subtle/30 bg-surface/80 px-3 py-2 backdrop-blur-md lg:hidden">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-content">
            {meta?.symbol_code ?? quote?.symbol_code ?? "Symbol"}
          </div>
          <div className="font-mono text-[11px] text-muted">
            {displayPrice}{" "}
            <span className={dayChange >= 0 ? "text-bull" : "text-bear"}>{fmtSignedPct(dayChange)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
          <ConnectionStatusChip compact />
          <button type="button" className="btn-chip" onClick={() => setFullscreen(true)}>
            Full
          </button>
        </div>
      </header>

      {/* Desktop toolbar */}
      <header className="hidden h-11 shrink-0 items-center justify-between gap-3 border-b border-subtle/30 bg-surface/60 px-4 backdrop-blur-md lg:flex">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold tracking-tight text-content">
                {meta?.symbol_code ?? quote?.symbol_code ?? "Symbol"}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-faint">{marketLabel}</span>
              <ConnectionStatusChip />
              {quote?.market_status && (
                <Badge tone={quote.market_status === "OPEN" ? "bull" : "neutral"}>
                  {quote.market_status}
                </Badge>
              )}
              {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
              {predictive && (
                <span className="hidden font-mono text-[11px] text-muted xl:inline">
                  {predictive.state} · Entry {predictive.entry}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-baseline gap-2 border-l border-subtle/30 pl-3">
            <span className="font-mono text-base font-semibold tabular-nums text-content">
              {displayPrice}
            </span>
            <span
              className={cx(
                "font-mono text-xs tabular-nums",
                dayChange >= 0 ? "text-bull" : "text-bear",
              )}
            >
              {fmtSignedPct(dayChange)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LayoutPicker />
          {activePane && !multi && (
            <>
              <TimeframeSelector
                value={activeTf}
                onChange={(t) => setPaneTimeframe(activePane.id, t)}
              />
              <OverlayToggles overlays={activePane.overlays} onChange={onOverlay} />
            </>
          )}
          <button
            type="button"
            className="btn-chip"
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            title={aiPanelOpen ? "Hide AI panel" : "Show AI panel"}
          >
            AI {aiPanelOpen ? "▾" : "▸"}
          </button>
          <button
            type="button"
            className="btn-chip"
            onClick={() => setFullscreen(true)}
            title="Fullscreen (Esc to exit)"
          >
            Fullscreen
          </button>
          <TopBarActions />
        </div>
      </header>

      {/* Mobile TF + AI */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-subtle/20 px-2 py-1.5 lg:hidden">
        {activePane && (
          <TimeframeSelector
            value={activeTf}
            onChange={(t) => setPaneTimeframe(activePane.id, t)}
            compact
          />
        )}
        <button
          type="button"
          className="btn-chip shrink-0"
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
        >
          AI {aiPanelOpen ? "▾" : "▸"}
        </button>
      </div>

      {/* Main workspace — chart dominates (~75–80%) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-[1_1_78%] basis-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-1 lg:p-1.5">{chartGrid}</div>

          {aiPanelOpen && activeSymbolId && (
            <aside className="hidden w-[min(300px,26vw)] shrink-0 flex-col border-l border-subtle/30 bg-surface/40 lg:flex">
              <AnalysisPanel id={activeSymbolId} tf={activeTf} />
            </aside>
          )}
        </div>

        {aiPanelOpen && activeSymbolId && (
          <div className="max-h-[42vh] shrink-0 overflow-auto border-t border-subtle/30 lg:hidden">
            <AnalysisPanel id={activeSymbolId} tf={activeTf} />
          </div>
        )}

        {isMobile && panes.length > 1 && (
          <div className="flex justify-center gap-1.5 py-1.5 lg:hidden">
            {panes.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Chart pane`}
                className={cx(
                  "h-1.5 w-1.5 rounded-full",
                  p.id === activePaneId ? "bg-brand" : "bg-subtle",
                )}
                onClick={() => setActivePane(p.id)}
              />
            ))}
          </div>
        )}

        <div className="hidden shrink-0 border-t border-subtle/30 bg-surface/40 lg:block">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-1 text-[10px] uppercase tracking-wider text-faint hover:text-muted"
            onClick={() => setBottomOpen(!bottomOpen)}
          >
            <span>Workbench</span>
            <span className="font-mono">{bottomOpen ? "▾" : "▸"}</span>
          </button>
          {bottomOpen && activeSymbolId && (
            <div className="h-[180px] border-t border-subtle/20">
              <BottomPanel id={activeSymbolId} tf={activeTf} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useIsMobile() {
  return useMediaQuery("(max-width: 1023px)");
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

function useSwipePanes(
  paneIds: string[],
  activeId: string,
  setActive: (id: string) => void,
  enabled: boolean,
) {
  const startX = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || paneIds.length < 2) return;

    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0]?.clientX ?? null;
    };
    const onEnd = (e: TouchEvent) => {
      if (startX.current == null) return;
      const x = e.changedTouches[0]?.clientX ?? startX.current;
      const dx = x - startX.current;
      startX.current = null;
      if (Math.abs(dx) < 56) return;
      const idx = paneIds.indexOf(activeId);
      if (idx < 0) return;
      const next = dx < 0 ? paneIds[idx + 1] : paneIds[idx - 1];
      if (next) setActive(next);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [paneIds, activeId, setActive, enabled]);

  return ref;
}
