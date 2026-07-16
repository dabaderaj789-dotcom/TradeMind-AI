import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { AnalysisPanel } from "../components/analysis/AnalysisPanel";
import { DecisionCard } from "../components/analysis/DecisionCard";
import { PredictiveSignalCard } from "../components/analysis/PredictiveSignalCard";
import { Why } from "../components/analysis/Why";
import { OverlayToggles } from "../components/chart/OverlayToggles";
import { TerminalChart, type OverlayData } from "../components/chart/TerminalChart";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { BottomPanel } from "../components/bottom/BottomPanel";
import { ConnectionStatusChip } from "../components/shell/ConnectionStatus";
import { TopBarActions } from "../components/layout/TopBarActions";
import { Badge, Spinner } from "../components/common/primitives";
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
} from "../hooks/queries";
import { useDecision } from "../hooks/useDecision";
import { useLiveStream } from "../hooks/useLiveStream";
import { useSymbolMeta } from "../hooks/useSymbolMeta";
import type { Timeframe } from "../lib/endpoints";
import { cx, fmtPct, fmtPrice, fmtSignedPct, fmtTime, num, titleCase } from "../lib/format";
import { MARKETS } from "../lib/markets";
import { usePrefs } from "../store/prefs";
import { OhlcComparePanel, QuoteVerifyPanel } from "../components/chart/OhlcComparePanel";
import { MarketQuoteBar } from "../components/chart/MarketQuoteBar";
import { useSettings } from "../store/settings";

export function TerminalPage() {
  const { symbolId = "" } = useParams();
  const meta = useSymbolMeta(symbolId);
  const defaultTf = useSettings((s) => s.defaultTimeframe);
  const overlays = useSettings((s) => s.overlays);
  const tvCompareMode = useSettings((s) => s.tvCompareMode);
  const marketCategory = usePrefs((s) => s.marketCategory);
  const [tf, setTf] = useState<Timeframe>(defaultTf);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useLiveStream({ symbolId, timeframe: tf, market: marketCategory, enabled: !!symbolId });

  const candles = useCandles(symbolId, tf);
  const quoteQ = useMarketQuote(symbolId);
  const levels = useLevels(symbolId, tf);
  const events = useStructureEvents(symbolId, tf);
  const ob = useOrderBlocks(symbolId, tf);
  const fvg = useFvgs(symbolId, tf);
  const sweeps = useSweeps(symbolId, tf);
  const setups = useActiveSetups(symbolId, tf);
  const ema = useAnalysis(symbolId, tf, "ema", overlays.ema);
  const sma = useAnalysis(symbolId, tf, "sma", overlays.sma);
  const vwap = useAnalysis(symbolId, tf, "vwap", overlays.vwap);
  const { decision, annotations, predictive, isLoading, trend, plan } = useDecision(symbolId, tf);

  const overlayData = useMemo<OverlayData>(
    () => ({
      ema: ema.data?.items,
      sma: sma.data?.items,
      vwap: vwap.data?.items,
      quote: quoteQ.data ?? null,
      orderBlocks: ob.data?.items,
      fvgs: fvg.data?.items,
      sweeps: sweeps.data?.items,
      levels: levels.data ?? null,
      events: events.data ?? null,
      setups: setups.data?.items,
      annotations,
      predictive,
    }),
    [ema.data, sma.data, vwap.data, quoteQ.data, ob.data, fvg.data, sweeps.data, levels.data, events.data, setups.data, annotations, predictive],
  );

  const quote = quoteQ.data;
  const bars = candles.data?.items ?? [];
  const last = bars[bars.length - 1];
  const dayChange = quote?.day_change_pct ?? (last && bars[bars.length - 2]
    ? ((num(last.close) - num(bars[bars.length - 2].close)) / num(bars[bars.length - 2].close)) * 100
    : 0);
  const displayPrice = quote ? fmtPrice(quote.current_price) : last ? fmtPrice(last.close) : "—";
  const marketLabel = MARKETS.find((m) => m.id === marketCategory)?.label ?? "Market";

  const chartBlock = (
    <div className={cx("card min-h-0 flex-1 p-1 chart-stage", fullscreen && "rounded-none border-0")}>
      {candles.isLoading ? (
        <Spinner label="Loading chart…" />
      ) : bars.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">
          No candle data for this symbol / timeframe.
        </div>
      ) : (
        <TerminalChart candles={bars} enabled={overlays} data={overlayData} />
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-bg">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-subtle/60 px-3">
          <div className="min-w-0 truncate text-sm font-semibold text-content">
            {meta?.symbol_code ?? "Chart"} · {tf}
          </div>
          <div className="flex items-center gap-2">
            <ConnectionStatusChip compact />
            <button type="button" className="btn-chip" onClick={() => setFullscreen(false)}>
              Exit
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 p-1">{chartBlock}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* Mobile top bar: symbol · TF · live */}
      <header className="flex shrink-0 flex-col gap-2 border-b border-subtle/60 bg-surface/90 px-3 py-2 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold tracking-tight text-content">
              {meta?.symbol_code ?? "Symbol"}
            </div>
            <div className="truncate text-[11px] text-faint">
              {quote || last ? (
                <>
                  {displayPrice}{" "}
                  <span className={dayChange >= 0 ? "text-bull" : "text-bear"}>{fmtSignedPct(dayChange)}</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <ConnectionStatusChip compact />
        </div>
        <MarketQuoteBar quote={quote} loading={quoteQ.isLoading} compact />
        <div className="flex items-center justify-between gap-2 overflow-x-auto">
          <TimeframeSelector value={tf} onChange={setTf} />
          <button type="button" className="btn-chip shrink-0" onClick={() => setFullscreen(true)}>
            Full chart
          </button>
        </div>
      </header>

      {/* Desktop header */}
      <div className="hidden lg:block">
        <SymbolHeader
          symbolId={symbolId}
          code={meta?.symbol_code ?? "Symbol"}
          name={meta?.name ?? ""}
          exchange={meta?.exchange_code ?? ""}
          marketLabel={marketLabel}
          price={displayPrice}
          change={dayChange}
          marketStatus={quote?.market_status}
          decisionKind={decision?.kind}
          decisionTone={decision?.tone}
          tf={tf}
          onTf={setTf}
        />
        <MarketQuoteBar quote={quote} loading={quoteQ.isLoading} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:p-3">
            {decision && (
              <div className="hidden items-center gap-2 px-1 lg:flex flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-faint">Live AI bias</span>
                <Badge tone={decision.tone}>{decision.kind}</Badge>
                {predictive && (
                  <>
                    <Badge tone={predictive.stateTone}>{predictive.state}</Badge>
                    <span className="font-mono text-[11px] text-muted">
                      {predictive.label} · Entry {predictive.entry}
                    </span>
                  </>
                )}
                {!predictive && (
                  <span className="font-mono text-[11px] text-muted">
                    {Math.round(decision.confidence)}% confidence
                  </span>
                )}
              </div>
            )}
            <div className="min-h-[280px] flex-1 flex flex-col sm:min-h-[360px]">{chartBlock}</div>

            {/* Mobile AI stack below chart */}
            <div className="space-y-2 overflow-auto pb-2 xl:hidden animate-fade-in">
              <DecisionCard decision={decision} loading={isLoading} compact />
              {tvCompareMode && (
                <>
                  <OhlcComparePanel symbolId={symbolId} timeframe={tf} />
                  <QuoteVerifyPanel symbolId={symbolId} />
                </>
              )}
              <PredictiveSignalCard plan={predictive} loading={isLoading} />
              <MobileExpanders
                decision={decision}
                trend={trend}
                plan={plan}
                predictive={predictive}
                tf={tf}
                levels={levels.data}
                events={events.data}
                obCount={ob.data?.items.length ?? 0}
                fvgCount={fvg.data?.items.length ?? 0}
                sweepCount={sweeps.data?.items.length ?? 0}
                obExplanation={ob.data?.items?.[0]?.explanation}
                fvgExplanation={fvg.data?.items?.[0]?.explanation}
              />
            </div>
          </div>

          <div className="hidden w-[360px] shrink-0 flex-col border-l border-subtle/60 bg-surface/80 backdrop-blur-sm xl:flex">
            <AnalysisPanel id={symbolId} tf={tf} />
          </div>
        </div>

        <div className="hidden shrink-0 border-t border-subtle/60 bg-surface lg:block">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider text-faint transition-colors hover:bg-elevated/40 hover:text-muted"
            onClick={() => setBottomOpen((v) => !v)}
          >
            <span>Workbench · Opportunities · Events · Backtests</span>
            <span className="font-mono">{bottomOpen ? "▾" : "▸"}</span>
          </button>
          {bottomOpen && (
            <div className="h-[240px] border-t border-subtle/40">
              <BottomPanel id={symbolId} tf={tf} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileExpanders({
  decision,
  trend,
  plan,
  predictive,
  tf,
  levels,
  events,
  obCount,
  fvgCount,
  sweepCount,
  obExplanation,
  fvgExplanation,
}: {
  decision: ReturnType<typeof useDecision>["decision"];
  trend: ReturnType<typeof useDecision>["trend"];
  plan: ReturnType<typeof useDecision>["plan"];
  predictive: ReturnType<typeof useDecision>["predictive"];
  tf: string;
  levels: ReturnType<typeof useLevels>["data"];
  events: ReturnType<typeof useStructureEvents>["data"];
  obCount: number;
  fvgCount: number;
  sweepCount: number;
  obExplanation?: string;
  fvgExplanation?: string;
}) {
  const latestBos = events?.bos_events?.[0];
  const latestChoch = events?.choch_events?.[0];

  return (
    <div className="space-y-1.5">
      <ExpandSection title="Why?" defaultOpen>
        {decision ? (
          <div className="space-y-2 text-[12px] text-muted leading-relaxed">
            <p>{decision.reasoning}</p>
            <div className="flex flex-wrap gap-1.5">
              {decision.evidenceSummary.map((e) => (
                <span key={e} className="pill bg-elevated text-muted">
                  {e}
                </span>
              ))}
            </div>
            <Why
              title={`${decision.kind} — Why?`}
              summary={`${decision.setupType} · ${decision.strategyName}`}
              reasoning={decision.reasoning}
              confidence={{
                score: decision.confidence,
                note: `Evidence gate · ${fmtPct(decision.confidence, 0)}`,
              }}
              evidence={decision.evidenceScores}
              contributions={decision.contributions}
              raw={decision}
            />
          </div>
        ) : (
          <p className="text-xs text-faint">Waiting for analysis…</p>
        )}
      </ExpandSection>

      <ExpandSection title="Trade Plan">
        {predictive ? (
          <ul className="space-y-1 text-[12px] text-muted">
            <li>State · {predictive.state}</li>
            <li>Entry · {fmtPrice(predictive.entry)}</li>
            <li>Stop · {fmtPrice(predictive.stop)}</li>
            <li>
              Targets · {[predictive.target1, predictive.target2, predictive.target3]
                .filter((t): t is number => t != null)
                .map(fmtPrice)
                .join(" / ") || "—"}
            </li>
          </ul>
        ) : plan ? (
          <ul className="space-y-1 text-[12px] text-muted">
            <li>
              Entry ·{" "}
              {plan.entry_zone
                ? Object.values(plan.entry_zone)
                    .map((v) => fmtPrice(v))
                    .join(" – ")
                : "—"}
            </li>
            <li>Stop · {fmtPrice(plan.stop_loss)}</li>
            <li>
              Targets · {[plan.target_1, plan.target_2, plan.target_3]
                .filter((t): t is number => t != null)
                .map(fmtPrice)
                .join(" / ")}
            </li>
            <li>R:R · {plan.risk_reward?.toFixed?.(2) ?? plan.risk_reward}</li>
          </ul>
        ) : (
          <p className="text-xs text-faint">No trade plan while decision is WAIT.</p>
        )}
      </ExpandSection>

      <ExpandSection title="Smart Money">
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg bg-elevated/60 px-2 py-2">
            <div className="text-faint">OB</div>
            <div className="font-semibold text-content">{obCount}</div>
          </div>
          <div className="rounded-lg bg-elevated/60 px-2 py-2">
            <div className="text-faint">FVG</div>
            <div className="font-semibold text-content">{fvgCount}</div>
          </div>
          <div className="rounded-lg bg-elevated/60 px-2 py-2">
            <div className="text-faint">Sweeps</div>
            <div className="font-semibold text-content">{sweepCount}</div>
          </div>
        </div>
        {(obExplanation || fvgExplanation) && (
          <p className="mt-2 line-clamp-3 text-[11px] text-muted">{obExplanation || fvgExplanation}</p>
        )}
      </ExpandSection>

      <ExpandSection title="Market Structure">
        <div className="space-y-2 text-[12px] text-muted">
          <div>
            Bias ·{" "}
            <span className="font-medium text-content">
              {trend ? titleCase(trend.trend) : "—"} · {trend ? titleCase(trend.market_phase) : "—"}
            </span>
          </div>
          <div className="text-[11px]">
            Supports {levels?.support_levels.length ?? 0} · Resistances {levels?.resistance_levels.length ?? 0}
          </div>
          <div className="text-[11px]">
            BOS {latestBos ? titleCase(latestBos.event_type) : "—"} · CHoCH{" "}
            {latestChoch ? titleCase(latestChoch.event_type) : "—"}
          </div>
          <div className="text-[10px] text-faint">{tf} · as of {trend ? fmtTime(trend.as_of) : "—"}</div>
        </div>
      </ExpandSection>
    </div>
  );
}

function ExpandSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-subtle/60 bg-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3.5 py-3 text-left text-sm font-medium text-content min-h-[44px]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {title}
        <span className="font-mono text-faint">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="border-t border-subtle/50 px-3.5 py-3">{children}</div>}
    </div>
  );
}

function SymbolHeader({
  symbolId,
  code,
  name,
  exchange,
  marketLabel,
  price,
  change,
  marketStatus,
  decisionKind,
  decisionTone,
  tf,
  onTf,
}: {
  symbolId: string;
  code: string;
  name: string;
  exchange: string;
  marketLabel: string;
  price: string;
  change: number;
  marketStatus?: "OPEN" | "CLOSED";
  decisionKind?: string;
  decisionTone?: "bull" | "bear" | "neutral" | "warn" | "info" | "brand";
  tf: Timeframe;
  onTf: (tf: Timeframe) => void;
}) {
  const isWatched = usePrefs((s) => s.isWatched);
  const addWatch = usePrefs((s) => s.addWatch);
  const removeWatch = usePrefs((s) => s.removeWatch);
  const isFavorite = usePrefs((s) => s.isFavorite);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const watched = isWatched(symbolId);
  const fav = isFavorite(symbolId);
  const lite = { id: symbolId, symbol_code: code, name, exchange_code: exchange };

  return (
    <header className="flex h-[58px] items-center justify-between gap-3 border-b border-subtle/60 bg-surface/90 px-4 backdrop-blur-md lg:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-content">{code}</span>
            <span className="text-[10px] uppercase tracking-wide text-faint">{marketLabel}</span>
            <ConnectionStatusChip />
            {marketStatus && (
              <Badge tone={marketStatus === "OPEN" ? "bull" : "neutral"}>{marketStatus}</Badge>
            )}
            {decisionKind && decisionTone && <Badge tone={decisionTone}>{decisionKind}</Badge>}
          </div>
          <div className="truncate text-[11px] text-faint">{name || exchange} · AI trading terminal</div>
        </div>
        <div className="flex items-baseline gap-2 border-l border-subtle/60 pl-3">
          <span className="font-mono text-lg font-semibold tabular-nums text-content">{price}</span>
          <span className={cx("font-mono text-xs tabular-nums", change >= 0 ? "text-bull" : "text-bear")}>
            {fmtSignedPct(change)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className={cx("btn-chip !px-2", fav && "text-warn border-warn/40")}
          title={fav ? "Unfavorite" : "Favorite"}
          onClick={() => toggleFavorite(lite)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L6.9 14.3l-5-4.9 7-.9z" />
          </svg>
        </button>
        <button className="btn-chip" onClick={() => (watched ? removeWatch(symbolId) : addWatch(lite))}>
          {watched ? "Watching" : "+ Watch"}
        </button>
        <OverlayToggles />
        <TimeframeSelector value={tf} onChange={onTf} />
        <TopBarActions />
      </div>
    </header>
  );
}
