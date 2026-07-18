/**
 * TradeMind AI Terminal V2 — chart-first institutional workspace.
 * Reuses existing API hooks / decision engine. No backend changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnalysisPanel } from "../components/analysis/AnalysisPanel";
import { ChartPane } from "../components/chart/ChartPane";
import { LayoutPicker } from "../components/chart/LayoutPicker";
import { OverlayToggles } from "../components/chart/OverlayToggles";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
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
  const watchlistOpen = useWorkspace((s) => s.watchlistOpen);
  const fullscreen = useWorkspace((s) => s.fullscreen);
  const syncPrimarySymbol = useWorkspace((s) => s.syncPrimarySymbol);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);
  const setWatchlistOpen = useWorkspace((s) => s.setWatchlistOpen);
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
  const resolved = resolvePrice(quote ?? null, bars);
  const displayPrice = resolved.price != null ? fmtPrice(resolved.price) : "—";
  const freshness = dataFreshness(resolved.asOfMs, activeTf, quote?.market_status ?? null);
  const marketLabel = MARKETS.find((m) => m.id === marketCategory)?.label ?? "Market";
  const multi = layout !== "1";
  const compactPanes = layout === "6" || layout === "8";
  const symbolCode = meta?.symbol_code ?? quote?.symbol_code ?? "Symbol";

  const onOverlay = useCallback(
    (id: OverlayId, on: boolean) => {
      if (activePane) setPaneOverlay(activePane.id, id, on);
    },
    [activePane, setPaneOverlay],
  );

  const swipeRef = useSwipePanes(
    panes.map((p) => p.id),
    activePaneId,
    setActivePane,
    isMobile && panes.length > 1,
  );

  const visiblePanes = isMobile
    ? panes.filter((p) => p.id === activePaneId).length
      ? panes.filter((p) => p.id === activePaneId)
      : panes.slice(0, 1)
    : panes;

  const chartGrid = (
    <div
      ref={swipeRef}
      className={cx(
        "grid min-h-0 flex-1 gap-px bg-subtle/20",
        isMobile ? "grid-cols-1 grid-rows-1" : layoutGridClass(layout),
      )}
    >
      {visiblePanes.map((pane) => (
        <div key={pane.id} className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
          <ChartPane
            pane={pane}
            compact={isMobile ? false : compactPanes || multi}
            showToolbar={isMobile || multi || fullscreen}
          />
        </div>
      ))}
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
      title={resolved.asOfMs ? `As of ${new Date(resolved.asOfMs).toLocaleTimeString()}` : "No data"}
    >
      {freshness.label}
    </span>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-bg animate-fade-in">
        <div className="v2-toolbar !h-11">
          <div className="min-w-0 truncate font-display text-sm font-semibold tracking-tight">
            {symbolCode}
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
          <button type="button" className="btn-chip" onClick={() => setFullscreen(false)}>
            Exit
          </button>
        </div>
        <div className="min-h-0 flex-1">{chartGrid}</div>
        {isMobile && panes.length > 1 && <PaneDots panes={panes} active={activePaneId} onSelect={setActivePane} />}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* Mobile header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-subtle/30 bg-surface/80 px-3 py-2.5 backdrop-blur-xl lg:hidden">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-semibold tracking-tight">{symbolCode}</div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px]">
            <span className="text-content">{displayPrice}</span>
            <span className={dayChange >= 0 ? "text-bull" : "text-bear"}>{fmtSignedPct(dayChange)}</span>
            {freshnessChip}
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

      {/* Desktop command bar */}
      <header className="v2-toolbar hidden lg:flex">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-content">
                {symbolCode}
              </h1>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                {marketLabel}
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
          <div className="flex items-baseline gap-2.5 border-l border-subtle/30 pl-3">
            <span className="font-mono text-[18px] font-semibold tabular-nums tracking-tight text-content">
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
          {predictive && (
            <div className="hidden items-center gap-2 border-l border-subtle/30 pl-3 xl:flex">
              <span className={cx("text-[11px] font-semibold", predictive.direction === "buy" ? "text-bull" : "text-bear")}>
                {predictive.label}
              </span>
              <span className="font-mono text-[10px] text-muted">
                R:R {predictive.riskReward?.toFixed(2) ?? "—"} · Ent {predictive.entry}
              </span>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
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
            className={cx("btn-chip", watchlistOpen && "btn-chip-active")}
            onClick={() => setWatchlistOpen(!watchlistOpen)}
          >
            Lists
          </button>
          <button
            type="button"
            className={cx("btn-chip", aiPanelOpen && "btn-chip-active")}
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
          >
            AI
          </button>
          <button type="button" className="btn-chip" onClick={() => setFullscreen(true)} title="Fullscreen (Esc)">
            Fullscreen
          </button>
          <TopBarActions />
        </div>
      </header>

      {/* Mobile TF strip */}
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
          className={cx("btn-chip shrink-0", aiPanelOpen && "btn-chip-active")}
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
        >
          AI
        </button>
      </div>

      {/* Workspace — chart ~85% */}
      <div className="flex min-h-0 flex-1">
        {!isMobile && watchlistOpen && <WatchlistDrawer />}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{chartGrid}</div>

        {aiPanelOpen && activeSymbolId && (
          <aside className="v2-panel hidden w-[min(320px,28vw)] shrink-0 flex-col animate-slide-in-right lg:flex">
            <AnalysisPanel id={activeSymbolId} tf={activeTf} />
          </aside>
        )}
      </div>

      {aiPanelOpen && activeSymbolId && (
        <div className="max-h-[44vh] shrink-0 overflow-auto border-t border-subtle/30 bg-surface/90 animate-fade-in lg:hidden">
          <AnalysisPanel id={activeSymbolId} tf={activeTf} />
        </div>
      )}

      {isMobile && panes.length > 1 && (
        <PaneDots panes={panes} active={activePaneId} onSelect={setActivePane} />
      )}
    </div>
  );
}

function PaneDots({
  panes,
  active,
  onSelect,
}: {
  panes: { id: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex justify-center gap-1.5 py-2 lg:hidden">
      {panes.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-label="Chart pane"
          className={cx(
            "h-1.5 rounded-full transition-all duration-200",
            p.id === active ? "w-4 bg-brand" : "w-1.5 bg-subtle",
          )}
          onClick={() => onSelect(p.id)}
        />
      ))}
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
