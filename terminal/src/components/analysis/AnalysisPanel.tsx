import { useMemo } from "react";
import {
  useAnalysis,
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
import { useCandles } from "../../hooks/queries";

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
    <div className="h-full overflow-auto p-3 space-y-3 ai-panel-scroll">
      <div className="px-1 pt-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">AI Assistant</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-sm text-muted">Institutional analyst view</span>
          {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
        </div>
      </div>

      <AnalystBriefCard brief={brief} loading={isLoading} />

      {predictive && <PredictiveSignalCard plan={predictive} loading={isLoading} />}

      {decision && decision.qualityChecks.length > 0 && (
        <Card title="Quality Gates" subtitle={`${decision.qualityChecks.filter((c) => c.passed).length}/${decision.qualityChecks.length} cleared`}>
          <ul className="space-y-1.5">
            {decision.qualityChecks.slice(0, 8).map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[11px]">
                <span className={c.passed ? "text-bull shrink-0" : "text-warn shrink-0"}>
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
            <p className="mt-3 text-[11px] text-muted leading-relaxed">
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
