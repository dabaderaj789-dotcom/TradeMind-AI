import { useMemo } from "react";
import { useActiveSetups, useStrategies } from "../../hooks/queries";
import { useBacktest } from "../../hooks/useBacktest";
import { useRecommendation } from "../../hooks/useRecommendation";
import { fmtHolding } from "../../lib/tradeAnalytics";
import { fmtNum, fmtPct, isNum, num, titleCase } from "../../lib/format";
import { useBacktestStore, usePerformanceSnapshot } from "../../store/backtest";
import { Badge, EmptyState, Spinner, Stat } from "../common/primitives";

function pickEquity(row: Record<string, unknown>): number | null {
  for (const k of ["equity", "capital", "balance", "value", "total", "nav"]) {
    if (isNum(row[k])) return num(row[k]);
  }
  const firstNum = Object.values(row).find((v) => isNum(v));
  return firstNum != null ? num(firstNum) : null;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 260;
  const h = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className="w-full">
      <polyline points={pts} fill="none" stroke={up ? "rgb(var(--c-bull))" : "rgb(var(--c-bear))"} strokeWidth="1.5" />
    </svg>
  );
}

export function BacktestSummaryTab({ id, tf }: { id: string; tf: string }) {
  const setups = useActiveSetups(id, tf);
  const strategies = useStrategies();
  const { strategy } = useRecommendation(id, tf, setups.data?.items?.[0] ?? null);
  const strategyId = strategy?.strategy_id ?? strategies.data?.items?.[0]?.strategy_id ?? null;
  const bt = useBacktest(id, tf);
  const snap = usePerformanceSnapshot();
  const clearTrades = useBacktestStore((s) => s.clearTrades);

  const equity = useMemo(() => {
    const curve = bt.report.data?.equity_curve ?? [];
    return curve.map(pickEquity).filter((v): v is number => v != null);
  }, [bt.report.data]);

  const metrics = Object.entries(bt.report.data?.metrics ?? {});
  const w = snap.weekly;
  const b = snap.benchmarks;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Live engine performance — always visible */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              Decision engine performance
            </div>
            <div className="text-sm text-muted">Live outcomes from tracked trade plans</div>
          </div>
          <button type="button" className="btn-chip text-[10px]" onClick={() => clearTrades()}>
            Clear journal
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Signals" value={snap.trades.length} />
          <Stat label="Completed" value={snap.trades.filter((t) => t.completed).length} />
          <Stat
            label="Win rate"
            value={fmtPct(
              snap.strategies.length
                ? snap.strategies.reduce((s, x) => s + x.win_rate, 0) / Math.max(snap.strategies.length, 1)
                : 0,
              0,
            )}
            tone="bull"
          />
          <Stat label="False +" value={b.false_positives} tone="bear" />
          <Stat label="Missed" value={b.missed_trades} tone="warn" />
          <Stat label="Cancelled" value={b.cancelled_trades} tone="neutral" />
        </div>

        {/* Strategy leaderboard */}
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-wide text-faint mb-2">Strategy leaderboard</div>
          {snap.leaderboard.length === 0 ? (
            <p className="text-xs text-muted">No strategy outcomes yet.</p>
          ) : (
            <div className="space-y-2">
              {snap.leaderboard.slice(0, 6).map((s, i) => (
                <div key={s.strategy_id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-faint font-mono w-4">{i + 1}</span>
                    <span className="font-medium text-content truncate">{s.strategy_name}</span>
                    <Badge tone="neutral">{s.total_signals}</Badge>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                    <span className="text-bull">{s.win_rate.toFixed(0)}% WR</span>
                    <span className="text-muted">PF {s.profit_factor.toFixed(2)}</span>
                    <span className="text-faint">Q {s.signal_quality.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By market */}
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-wide text-faint mb-2">Best strategy by market</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(["crypto", "india", "forex"] as const).map((m) => {
              const top = snap.by_market[m]?.[0];
              return (
                <div key={m} className="rounded-lg border border-subtle/40 bg-bg/40 px-2.5 py-2">
                  <div className="text-[9px] uppercase text-faint">{m}</div>
                  <div className="mt-0.5 text-sm font-medium text-content truncate">
                    {top?.strategy_name ?? "—"}
                  </div>
                  <div className="text-[11px] font-mono text-muted">
                    {top ? `${top.win_rate.toFixed(0)}% WR · PF ${top.profit_factor.toFixed(2)}` : "No data"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Symbol + timeframe */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="card p-3">
            <div className="text-[10px] uppercase tracking-wide text-faint mb-2">Symbol performance</div>
            {snap.symbols.length === 0 ? (
              <p className="text-xs text-muted">No symbol history yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-auto">
                {snap.symbols.slice(0, 12).map((s) => (
                  <div key={s.symbol_id} className="flex items-center justify-between text-[11px] gap-2">
                    <span className="font-medium text-content">{s.symbol_code}</span>
                    <span className="font-mono text-muted">
                      {s.win_rate.toFixed(0)}% · {s.signal_count} sig · RR {s.average_rr.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card p-3">
            <div className="text-[10px] uppercase tracking-wide text-faint mb-2">Timeframe performance</div>
            <div className="grid grid-cols-2 gap-2">
              {snap.timeframes.map((t) => (
                <div key={t.timeframe} className="rounded-lg border border-subtle/40 bg-bg/40 px-2.5 py-2">
                  <div className="text-[9px] uppercase text-faint">{t.timeframe}</div>
                  <div className="font-mono text-sm text-content">{t.win_rate.toFixed(0)}% WR</div>
                  <div className="text-[10px] text-muted">
                    Acc {t.accuracy.toFixed(0)}% · RR {t.average_rr.toFixed(2)} · n={t.signal_count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Calibration */}
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-wide text-faint mb-2">Confidence calibration</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {snap.calibration.map((c) => (
              <div key={c.label} className="rounded-lg border border-subtle/40 bg-bg/40 px-2 py-2 text-center">
                <div className="text-[9px] text-faint">Pred {c.label}</div>
                <div className="font-mono text-sm text-content">{c.count ? `${c.actual_win_rate.toFixed(0)}%` : "—"}</div>
                <div className="text-[9px] text-muted">n={c.count}</div>
                {c.count >= 5 && (
                  <Badge tone={c.calibrated ? "bull" : "warn"}>{c.calibrated ? "OK" : "Skew"}</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Benchmarks */}
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-wide text-faint mb-2">Internal benchmark</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Stat label="False +" value={b.false_positives} />
            <Stat label="False −" value={b.false_negatives} />
            <Stat label="Late entry" value={b.late_entries} />
            <Stat label="Early entry" value={b.early_entries} />
            <Stat label="Missed" value={b.missed_trades} />
            <Stat label="Cancelled" value={b.cancelled_trades} />
          </div>
        </div>

        {/* Weekly improvement */}
        <div className="card p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-wide text-faint">Signal improvement report</div>
            <Badge tone="info">{w.period_label}</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <Meta label="Best setup" value={w.best_setup} />
            <Meta label="Worst setup" value={w.worst_setup} />
            <Meta label="Top failure" value={w.most_common_failure} />
            <Meta label="Best market" value={w.most_successful_market} />
            <Meta label="Best TF" value={w.most_successful_timeframe} />
            <Meta label="Sample" value={String(w.sample_size)} />
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted list-disc pl-4">
            {w.suggested_improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>

        {/* Per-strategy detail stats */}
        {snap.strategies.length > 0 && (
          <div className="card p-3">
            <div className="text-[10px] uppercase tracking-wide text-faint mb-2">Strategy statistics</div>
            <div className="space-y-2">
              {snap.strategies.map((s) => (
                <div key={s.strategy_id} className="rounded-lg border border-subtle/40 px-2.5 py-2">
                  <div className="text-xs font-medium text-content">{s.strategy_name}</div>
                  <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px] font-mono text-muted">
                    <span>Total {s.total_signals}</span>
                    <span>Active {s.active_signals}</span>
                    <span>W/L {s.winning_trades}/{s.losing_trades}</span>
                    <span>WR {s.win_rate.toFixed(1)}%</span>
                    <span>Avg RR {s.average_rr.toFixed(2)}</span>
                    <span>Hold {fmtHolding(s.average_holding_ms)}</span>
                    <span>Max DD {s.max_drawdown_r.toFixed(2)}R</span>
                    <span>PF {s.profit_factor.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Historical backtest (unchanged capability) */}
      <section className="space-y-3 border-t border-subtle/50 pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Historical backtest</div>
        {!bt.runId ? (
          <EmptyState>
            <p className="max-w-sm">
              Run a backtest of the matched strategy against historical data for simulated metrics.
            </p>
            <button
              className="btn-primary mt-1"
              disabled={!strategyId || bt.start.isPending}
              onClick={() => strategyId && bt.start.mutate(strategyId)}
            >
              {bt.start.isPending
                ? "Starting…"
                : strategyId
                  ? `Run backtest · ${strategy?.strategy_name ?? "strategy"}`
                  : "No strategy available"}
            </button>
            {bt.start.isError && <p className="text-xs text-bear mt-1">{(bt.start.error as Error).message}</p>}
          </EmptyState>
        ) : bt.isRunning ? (
          <Spinner
            label={`Running backtest… (${bt.status?.status ?? "queued"}, ${bt.status?.bars_processed ?? 0} bars)`}
          />
        ) : bt.failed ? (
          <EmptyState>Backtest did not complete ({bt.status?.status}). Try running it again.</EmptyState>
        ) : bt.report.isLoading ? (
          <Spinner label="Loading report…" />
        ) : !bt.report.data ? (
          <EmptyState>No report available for this run.</EmptyState>
        ) : (
          <>
            {equity.length >= 2 && (
              <div className="card p-3">
                <div className="text-[10px] uppercase tracking-wide text-faint mb-1">Equity curve</div>
                <Sparkline values={equity} />
              </div>
            )}
            {metrics.length === 0 ? (
              <EmptyState>Report generated but contains no metrics.</EmptyState>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {metrics.map(([k, v]) => (
                  <Stat
                    key={k}
                    label={titleCase(k)}
                    value={isNum(v) ? fmtNum(v, Math.abs(num(v)) >= 100 ? 2 : 4) : String(v)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-subtle/40 bg-bg/40 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 font-medium text-content truncate">{value}</div>
    </div>
  );
}
