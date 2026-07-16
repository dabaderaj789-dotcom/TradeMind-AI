import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { cx, directionTone, fmtPct, fmtRelative, titleCase, trendLabel } from "../../lib/format";
import type { ScanRow } from "../../lib/types";
import { Badge, Dot, EmptyState } from "../common/primitives";

export type SortKey = "symbol" | "setup" | "trend" | "confidence" | "updated";
export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const GRID = "grid-cols-[1.5fr_1.3fr_1.1fr_1fr_0.7fr_1fr_0.7fr]";

export function ScannerTable({
  rows,
  sort,
  onSort,
  timeframe,
}: {
  rows: ScanRow[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  timeframe: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const select = useSelectSymbol();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  return (
    <div className="card flex flex-col h-full min-h-0">
      {/* Header */}
      <div className={cx("grid items-center px-4 py-2.5 border-b border-subtle/60 text-[11px] uppercase tracking-wide text-faint", GRID)}>
        <HeaderCell label="Symbol" k="symbol" sort={sort} onSort={onSort} />
        <HeaderCell label="Setup Type" k="setup" sort={sort} onSort={onSort} />
        <HeaderCell label="Trend" k="trend" sort={sort} onSort={onSort} />
        <HeaderCell label="Confidence" k="confidence" sort={sort} onSort={onSort} align="right" />
        <span>Timeframe</span>
        <HeaderCell label="Last Update" k="updated" sort={sort} onSort={onSort} align="right" />
        <span className="text-right">Action</span>
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <EmptyState>No symbols match your filters.</EmptyState>
      ) : (
        <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const tone = directionTone(row.trend?.trend);
              const setupTone = directionTone(row.topSetup?.direction);
              const updated = row.topSetup?.detected_at ?? row.trend?.as_of ?? null;
              return (
                <div
                  key={row.symbol.id}
                  className={cx(
                    "grid items-center px-4 border-b border-subtle/30 hover:bg-elevated/70 cursor-pointer transition-colors",
                    GRID,
                  )}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${vi.start}px)`, height: vi.size }}
                  onClick={() => select(row.symbol)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-content truncate">{row.symbol.symbol_code}</div>
                    <div className="text-[11px] text-faint truncate">{row.symbol.name}</div>
                  </div>
                  <div className="min-w-0">
                    {row.topSetup ? (
                      <span className="flex items-center gap-1.5 text-sm text-content truncate">
                        <Badge tone={setupTone}>{setupTone === "bull" ? "L" : setupTone === "bear" ? "S" : "—"}</Badge>
                        {titleCase(row.topSetup.setup_type)}
                      </span>
                    ) : (
                      <span className="text-sm text-faint">—</span>
                    )}
                  </div>
                  <div>
                    {row.trend ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <Dot tone={tone} />
                        <span className={tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-muted"}>
                          {trendLabel(row.trend.trend, row.trend.confidence)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-faint">—</span>
                    )}
                  </div>
                  <div className="text-right font-mono text-sm text-content">
                    {row.topSetup ? fmtPct(row.topSetup.confidence_score, 0) : "—"}
                  </div>
                  <div className="text-sm text-muted">{timeframe}</div>
                  <div className="text-right text-xs text-faint">{fmtRelative(updated)}</div>
                  <div className="text-right">
                    <span className="btn-chip !py-1 !px-2 inline-flex">Open</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderCell({
  label,
  k,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  return (
    <button
      className={cx("flex items-center gap-1 hover:text-content transition-colors", align === "right" && "justify-end", active && "text-content")}
      onClick={() => onSort(k)}
    >
      {label}
      <span className={cx("transition-opacity", active ? "opacity-100" : "opacity-0")}>
        {sort.dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}
