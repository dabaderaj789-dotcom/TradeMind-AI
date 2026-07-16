import { useMemo, useState } from "react";
import { useBacktest } from "../../hooks/useBacktest";
import { fmtHolding, type TrackedTrade } from "../../lib/tradeAnalytics";
import { cx, directionTone, fmtNum, fmtPrice, fmtSignedPct, fmtTime, titleCase } from "../../lib/format";
import { useBacktestStore, usePerformanceSnapshot } from "../../store/backtest";
import { Badge, EmptyState, Spinner } from "../common/primitives";
import { DataTable, Td, Th } from "./tables";
import { Why } from "../analysis/Why";

type ViewMode = "live" | "backtest";

export function TradeHistoryTab({ id, tf }: { id: string; tf: string }) {
  const bt = useBacktest(id, tf);
  const allTrades = useBacktestStore((s) => s.trades);
  const snapshot = usePerformanceSnapshot();
  const [mode, setMode] = useState<ViewMode>("live");
  const [selected, setSelected] = useState<TrackedTrade | null>(null);

  const liveRows = useMemo(() => {
    const forSymbol = allTrades.filter((t) => t.symbol_id === id);
    return (forSymbol.length ? forSymbol : allTrades).slice(0, 80);
  }, [allTrades, id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-subtle/50 px-3 py-2">
        <button
          type="button"
          className={cx("btn-chip text-[11px]", mode === "live" && "border-brand/40 text-brand")}
          onClick={() => setMode("live")}
        >
          Live outcomes ({liveRows.length})
        </button>
        <button
          type="button"
          className={cx("btn-chip text-[11px]", mode === "backtest" && "border-brand/40 text-brand")}
          onClick={() => setMode("backtest")}
        >
          Backtest
        </button>
        <span className="ml-auto text-[10px] text-faint">
          {snapshot.trades.filter((t) => t.completed).length} completed · journal auto-tracks every plan
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "live" ? (
          liveRows.length === 0 ? (
            <EmptyState>
              No tracked trade plans yet. When the engine issues an actionable BUY/SELL, the full lifecycle is recorded
              here automatically.
            </EmptyState>
          ) : (
            <DataTable
              head={
                <>
                  <Th>Generated</Th>
                  <Th>Symbol</Th>
                  <Th>Dir</Th>
                  <Th>Status</Th>
                  <Th align="right">Conf</Th>
                  <Th align="right">R</Th>
                  <Th>Strategy</Th>
                  <Th>TF</Th>
                  <Th>Review</Th>
                </>
              }
            >
              {liveRows.map((t) => {
                const tone = t.direction === "buy" ? "bull" : "bear";
                const win = t.won === true;
                const loss = t.won === false;
                return (
                  <tr key={t.id} className="border-b border-subtle/40 hover:bg-elevated/60">
                    <Td className="text-faint whitespace-nowrap text-[11px]">{fmtTime(t.created_at)}</Td>
                    <Td className="font-medium text-content">{t.symbol_code}</Td>
                    <Td>
                      <Badge tone={tone}>{t.direction === "buy" ? "Long" : "Short"}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={win ? "bull" : loss ? "bear" : t.completed ? "warn" : "info"}>
                        {titleCase(t.status)}
                      </Badge>
                    </Td>
                    <Td align="right" className="font-mono text-muted">
                      {Math.round(t.confidence)}%
                    </Td>
                    <Td
                      align="right"
                      className={cx("font-mono", win ? "text-bull" : loss ? "text-bear" : "text-muted")}
                    >
                      {t.pnl_r != null ? `${t.pnl_r >= 0 ? "+" : ""}${t.pnl_r.toFixed(2)}R` : "—"}
                    </Td>
                    <Td className="text-muted truncate max-w-[120px]">{t.strategy_name}</Td>
                    <Td className="text-faint">{t.timeframe}</Td>
                    <Td>
                      {t.review ? (
                        <button type="button" className="text-[11px] text-brand underline" onClick={() => setSelected(t)}>
                          Review
                        </button>
                      ) : (
                        <span className="text-faint text-[11px]">{t.completed ? "—" : "Open"}</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          )
        ) : !bt.runId ? (
          <EmptyState>Run a backtest from the Performance tab to populate simulated trade history.</EmptyState>
        ) : bt.isRunning ? (
          <Spinner label="Backtest running…" />
        ) : bt.failed ? (
          <EmptyState>Backtest did not complete.</EmptyState>
        ) : bt.trades.isLoading ? (
          <Spinner label="Loading trades…" />
        ) : (bt.trades.data?.items ?? []).length === 0 ? (
          <EmptyState>No trades were generated in this backtest.</EmptyState>
        ) : (
          <DataTable
            head={
              <>
                <Th align="right">Entry</Th>
                <Th>Dir</Th>
                <Th align="right">Entry px</Th>
                <Th align="right">Exit px</Th>
                <Th align="right">PnL</Th>
                <Th align="right">PnL %</Th>
                <Th>Exit reason</Th>
                <Th align="right">Bars</Th>
              </>
            }
          >
            {(bt.trades.data?.items ?? []).map((t) => {
              const tone = directionTone(t.direction);
              const win = t.pnl >= 0;
              return (
                <tr key={t.trade_id} className="border-b border-subtle/40 hover:bg-elevated/60">
                  <Td align="right" className="text-faint whitespace-nowrap">
                    {fmtTime(t.entry_time)}
                  </Td>
                  <Td>
                    <Badge tone={tone}>{tone === "bull" ? "Long" : "Short"}</Badge>
                  </Td>
                  <Td align="right" className="font-mono text-muted">
                    {fmtPrice(t.entry_price)}
                  </Td>
                  <Td align="right" className="font-mono text-muted">
                    {t.exit_price != null ? fmtPrice(t.exit_price) : "—"}
                  </Td>
                  <Td align="right" className={cx("font-mono", win ? "text-bull" : "text-bear")}>
                    {fmtNum(t.pnl)}
                  </Td>
                  <Td align="right" className={cx("font-mono", win ? "text-bull" : "text-bear")}>
                    {fmtSignedPct(t.pnl_pct)}
                  </Td>
                  <Td className="text-muted">{t.exit_reason ? titleCase(t.exit_reason) : "—"}</Td>
                  <Td align="right" className="text-faint">
                    {t.bars_held}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </div>

      {selected?.review && (
        <div className="shrink-0 border-t border-subtle/50 bg-surface/90 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint">Trade review</div>
              <div className="text-sm font-semibold text-content">
                {selected.symbol_code} · {titleCase(selected.status)}
              </div>
            </div>
            <button type="button" className="btn-chip text-[11px]" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="mt-2 text-xs text-muted leading-relaxed">{selected.review.summary}</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <ReviewCell label="Why it worked" value={selected.review.whyWorked} />
            <ReviewCell label="Why it failed" value={selected.review.whyFailed} />
            <ReviewCell label="Strongest rule" value={selected.review.strongestRule} />
            <ReviewCell label="Failed rule" value={selected.review.failedRule} />
            <ReviewCell
              label="Would take again?"
              value={selected.review.wouldTakeAgain ? "Yes" : "No"}
            />
            <ReviewCell label="Hold time" value={fmtHolding(selected.holding_ms)} />
          </div>
          <div className="mt-2">
            <Why
              title={`Lifecycle · ${selected.symbol_code}`}
              summary={titleCase(selected.status)}
              reasoning={selected.review.summary}
              contributions={selected.events.map((e) => ({
                label: titleCase(e.type),
                value: fmtTime(e.at) + (e.price != null ? ` · ${fmtPrice(e.price)}` : ""),
              }))}
              raw={selected}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-subtle/40 bg-bg/40 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 text-content">{value}</div>
    </div>
  );
}
