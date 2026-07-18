import { useMemo } from "react";
import {
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
import { buildAnalystBrief } from "../../lib/analystBrief";
import { titleCase } from "../../lib/format";
import { resolvePrice } from "../../lib/marketPrice";
import { Badge, Card } from "../common/primitives";
import { AnalystBriefCard } from "./AnalystBriefCard";
import { PredictiveSignalCard } from "./PredictiveSignalCard";
import { OhlcComparePanel, QuoteVerifyPanel } from "../chart/OhlcComparePanel";
import { useSettings } from "../../store/settings";

/** Terminal V2 AI rail — institutional brief first. */
export function AnalysisPanel({ id, tf }: { id: string; tf: string }) {
  const { decision, predictive, isLoading, trend } = useDecision(id, tf);
  const tvCompareMode = useSettings((s) => s.tvCompareMode);
  const levels = useLevels(id, tf);
  const events = useStructureEvents(id, tf);
  const ms = useAnalysis(id, tf, "market_structure", true);
  const ob = useOrderBlocks(id, tf);
  const fvg = useFvgs(id, tf);
  const sweeps = useSweeps(id, tf);
  const quote = useMarketQuote(id);
  const candles = useCandles(id, tf);

  const swings = useMemo(() => {
    const items = ms.data?.items ?? [];
    return items
      .filter((b) => b.values.swing_type)
      .slice(-6)
      .reverse()
      .map((b) => ({
        time: b.open_time,
        type: String(b.values.swing_type),
      }));
  }, [ms.data]);

  const lastPrice = useMemo(() => {
    const resolved = resolvePrice(quote.data ?? null, candles.data?.items ?? []);
    return resolved.price;
  }, [quote.data, candles.data]);

  const brief = useMemo(
    () =>
      buildAnalystBrief({
        decision,
        predictive,
        trend,
        levels: levels.data,
        events: events.data,
        orderBlocks: ob.data?.items,
        fvgs: fvg.data?.items,
        sweeps: sweeps.data?.items,
        swings,
        lastPrice,
      }),
    [decision, predictive, trend, levels.data, events.data, ob.data, fvg.data, sweeps.data, swings, lastPrice],
  );

  return (
    <div className="h-full space-y-3 overflow-auto p-3.5 ai-panel-scroll animate-fade-in">
      <div className="px-0.5 pb-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-faint">Analyst</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-display text-sm font-semibold tracking-tight text-content">
            Market brief
          </span>
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
        </div>
      </div>

      <AnalystBriefCard brief={brief} loading={isLoading} />

      {predictive && <PredictiveSignalCard plan={predictive} loading={isLoading} />}

      {decision && decision.qualityChecks.length > 0 && (
        <Card
          title="Quality gates"
          subtitle={`${decision.qualityChecks.filter((c) => c.passed).length}/${decision.qualityChecks.length} cleared`}
        >
          <ul className="space-y-1.5">
            {decision.qualityChecks.slice(0, 8).map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[11px]">
                <span className={c.passed ? "shrink-0 text-bull" : "shrink-0 text-warn"}>
                  {c.passed ? "●" : "○"}
                </span>
                <span className="min-w-0">
                  <span className="text-content">{c.label}</span>
                  <span className="text-faint"> — {c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {decision.mtf.summary && (
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Multi-timeframe: {decision.mtf.summary}
              {trend ? ` · Phase ${titleCase(trend.market_phase)}` : ""}
            </p>
          )}
        </Card>
      )}

      {tvCompareMode && (
        <>
          <OhlcComparePanel symbolId={id} timeframe={tf} />
          <QuoteVerifyPanel symbolId={id} />
        </>
      )}
    </div>
  );
}
