import { useMemo } from "react";
import {
  useAnalysis,
  useFvgs,
  useLevels,
  useOrderBlocks,
  useStructureEvents,
  useSweeps,
  useTrend,
} from "../../hooks/queries";
import { useDecision } from "../../hooks/useDecision";
import { directionTone, fmtPct, fmtTime, titleCase, trendLabel } from "../../lib/format";
import { Badge, Card, Dot, Skeleton, Stat } from "../common/primitives";
import { DecisionCard } from "./DecisionCard";
import { PredictiveSignalCard } from "./PredictiveSignalCard";
import { Why } from "./Why";
import { OhlcComparePanel, QuoteVerifyPanel } from "../chart/OhlcComparePanel";
import { useSettings } from "../../store/settings";

export function AnalysisPanel({ id, tf }: { id: string; tf: string }) {
  const { decision, predictive, isLoading, trend, setups } = useDecision(id, tf);
  const tvCompareMode = useSettings((s) => s.tvCompareMode);
  const trendQ = useTrend(id, tf);
  const levels = useLevels(id, tf);
  const events = useStructureEvents(id, tf);
  const ms = useAnalysis(id, tf, "market_structure", true);
  const ob = useOrderBlocks(id, tf);
  const fvg = useFvgs(id, tf);
  const sweeps = useSweeps(id, tf);

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

  const latestBos = events.data?.bos_events?.[0];
  const latestChoch = events.data?.choch_events?.[0];
  const obCount = ob.data?.items.length ?? 0;
  const fvgCount = fvg.data?.items.length ?? 0;
  const sweepCount = sweeps.data?.items.length ?? 0;
  const mitigated = (ob.data?.items ?? []).filter(
    (o) => !o.mitigation_state.toLowerCase().includes("unmitigated"),
  ).length;

  const tone = directionTone(trend?.trend);
  const label = trend ? trendLabel(trend.trend, trend.confidence) : "—";

  return (
    <div className="h-full overflow-auto p-3 space-y-3 ai-panel-scroll">
      <div className="px-1 pt-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">AI Assistant</div>
        <div className="text-sm text-muted mt-0.5">Live decision support from the analysis engine</div>
      </div>

      <PredictiveSignalCard plan={predictive} loading={isLoading} />

      <DecisionCard decision={decision} loading={isLoading} />

      {tvCompareMode && (
        <>
          <OhlcComparePanel symbolId={id} timeframe={tf} />
          <QuoteVerifyPanel symbolId={id} />
        </>
      )}

      {/* Compact analysis stack */}
      <Card
        title="Trend & Structure"
        actions={
          trend && (
            <Why
              title="Trend & Market Structure"
              summary={`${label} · ${tf}`}
              reasoning={`The ${tf} structure is ${label.toLowerCase()} (${trend.confidence.toFixed(0)}% confidence) in a ${titleCase(trend.market_phase).toLowerCase()} phase. Recent swings and BOS/CHoCH events confirm the structural bias used by the AI decision.`}
              confidence={{ score: trend.confidence, note: "Swing direction + phase alignment." }}
              evidence={{
                "Trend confidence": trend.confidence,
                "Phase confidence": trend.phase_confidence,
              }}
              contributions={[
                { label: "Supports", value: String(levels.data?.support_levels.length ?? 0) },
                { label: "Resistances", value: String(levels.data?.resistance_levels.length ?? 0) },
                { label: "Latest BOS", value: latestBos ? titleCase(latestBos.event_type) : "—" },
                { label: "Latest CHoCH", value: latestChoch ? titleCase(latestChoch.event_type) : "—" },
              ]}
              raw={{ trend, levels: levels.data, events: events.data, swings }}
            />
          )
        }
      >
        {trendQ.isLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div
                  className={`text-lg font-semibold ${
                    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-muted"
                  }`}
                >
                  {label}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {trend && <Badge tone={tone}>{titleCase(trend.market_phase)}</Badge>}
                  {decision && <Badge tone={decision.tone}>{fmtPct(decision.confidence, 0)} conf.</Badge>}
                </div>
              </div>
              <div className="text-right text-[11px] text-faint">
                <div>Trade quality</div>
                <div className="text-content font-medium mt-0.5">{decision?.tradeQuality ?? "—"}</div>
                <div className="mt-1">Risk</div>
                <div className="text-content font-medium mt-0.5">{decision?.riskLabel ?? "—"}</div>
              </div>
            </div>

            {swings.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {swings.map((s) => (
                  <span key={s.time + s.type} className="pill bg-elevated text-muted">
                    <Dot tone={s.type.startsWith("H") ? "bull" : "bear"} />
                    {s.type}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <EventPill
                label="BOS"
                value={latestBos ? titleCase(latestBos.event_type.replace(/_/g, " ")) : "None"}
                sub={latestBos ? fmtTime(latestBos.break_time) : undefined}
              />
              <EventPill
                label="CHoCH"
                value={latestChoch ? titleCase(latestChoch.event_type.replace(/_/g, " ")) : "None"}
                sub={latestChoch ? fmtTime(latestChoch.break_time) : undefined}
              />
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Smart Money"
        subtitle="Institutional footprint"
        actions={
          <Why
            title="Smart Money Summary"
            summary={`${tf} · OB / FVG / Sweeps`}
            reasoning="Order blocks mark institutional demand/supply. Fair value gaps are inefficiencies likely to be rebalanced. Liquidity sweeps capture stop-runs that often precede reversals. These factors feed the AI decision confidence and quality score."
            contributions={[
              { label: "Active order blocks", value: String(obCount) },
              { label: "Fair value gaps", value: String(fvgCount) },
              { label: "Liquidity sweeps", value: String(sweepCount) },
              { label: "Mitigated zones", value: String(mitigated) },
              ...(ob.data?.items ?? []).slice(0, 3).map((o) => ({
                label: `OB ${titleCase(o.type)}`,
                value: `${Math.round(o.confidence)}%`,
              })),
            ]}
            evidence={Object.fromEntries(
              (ob.data?.items ?? [])
                .slice(0, 3)
                .map((o, i) => [`Order block ${i + 1}`, o.confidence]),
            )}
            raw={{ orderBlocks: ob.data?.items, fvgs: fvg.data?.items, sweeps: sweeps.data?.items }}
          />
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Order Blocks" value={obCount} tone={obCount > 0 ? "brand" : "neutral"} />
          <Stat label="Fair Value Gaps" value={fvgCount} tone={fvgCount > 0 ? "info" : "neutral"} />
          <Stat label="Liquidity Sweeps" value={sweepCount} tone={sweepCount > 0 ? "warn" : "neutral"} />
          <Stat label="Mitigated" value={mitigated} tone="neutral" />
        </div>
        {(ob.data?.items?.[0] || fvg.data?.items?.[0]) && (
          <p className="mt-3 text-[11px] text-muted leading-relaxed line-clamp-3">
            {ob.data?.items?.[0]?.explanation || fvg.data?.items?.[0]?.explanation}
          </p>
        )}
      </Card>

      {setups.length > 1 && (
        <Card title="Other active setups" subtitle={`${setups.length - 1} alternative`}>
          <div className="space-y-2">
            {setups.slice(1, 4).map((s) => (
              <div
                key={s.setup_id}
                className="flex items-center justify-between gap-2 rounded-lg bg-elevated/60 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-content truncate">{titleCase(s.setup_type)}</div>
                  <div className="text-[10px] text-faint">{titleCase(s.direction)} · {fmtTime(s.detected_at)}</div>
                </div>
                <Badge tone={directionTone(s.direction)}>{Math.round(s.confidence_score)}%</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function EventPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-subtle/50 bg-elevated/40 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className="text-[12px] font-medium text-content truncate mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-faint mt-0.5">{sub}</div>}
    </div>
  );
}
