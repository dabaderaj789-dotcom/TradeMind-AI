import { useMemo, useState } from "react";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { TopBarActions } from "../components/layout/TopBarActions";
import { ScannerFilters } from "../components/scanner/ScannerFilters";
import { ScannerTable, type SortKey, type SortState } from "../components/scanner/ScannerTable";
import { MarketPills } from "../components/sidebar/MarketPills";
import { useScanner } from "../hooks/useScanner";
import { directionTone } from "../lib/format";
import type { Timeframe } from "../lib/endpoints";
import type { ScanRow } from "../lib/types";
import { useSettings } from "../store/settings";

function sortRows(rows: ScanRow[], sort: SortState): ScanRow[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const val = (r: ScanRow): string | number => {
    switch (sort.key) {
      case "symbol":
        return r.symbol.symbol_code;
      case "setup":
        return r.topSetup?.setup_type ?? "";
      case "trend":
        return r.trend?.trend ?? "";
      case "confidence":
        return r.topSetup?.confidence_score ?? -1;
      case "updated":
        return new Date(r.topSetup?.detected_at ?? r.trend?.as_of ?? 0).getTime();
    }
  };
  return [...rows].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export function ScannerPage() {
  const defaultTf = useSettings((s) => s.defaultTimeframe);
  const filters = useSettings((s) => s.scannerFilters);
  const [tf, setTf] = useState<Timeframe>(defaultTf);
  const [sort, setSort] = useState<SortState>({ key: "confidence", dir: "desc" });

  const { rows, isFetching, refetch, count } = useScanner(tf);

  const setupTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.topSetup?.setup_type).filter(Boolean) as string[])),
    [rows],
  );

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (filters.onlyWithSetups && !r.topSetup) return false;
      if (filters.setupType && r.topSetup?.setup_type !== filters.setupType) return false;
      if (filters.minConfidence > 0 && (r.topSetup?.confidence_score ?? 0) < filters.minConfidence) return false;
      if (filters.trend && directionTone(r.trend?.trend) !== directionTone(filters.trend)) return false;
      return true;
    });
    return sortRows(out, sort);
  }, [rows, filters, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center justify-between gap-3 px-4 lg:px-6 h-14 border-b border-subtle/60 bg-surface">
        <div>
          <h1 className="text-base font-semibold text-content">Market Scanner</h1>
          <p className="text-[11px] text-faint">
            {isFetching ? "Scanning…" : `${filtered.length} of ${count} symbols`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeframeSelector value={tf} onChange={setTf} />
          <button className="btn-chip" onClick={refetch} disabled={isFetching}>
            <svg className={isFetching ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 3v6h-6" />
            </svg>
            Scan
          </button>
          <TopBarActions />
        </div>
      </header>

      <div className="px-4 lg:px-6 py-3 border-b border-subtle/60 bg-surface/60 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-faint shrink-0">
            Scope
          </span>
          <MarketPills />
        </div>
        <ScannerFilters setupTypes={setupTypes} />
      </div>

      <div className="flex-1 min-h-0 p-4 lg:p-6">
        <ScannerTable rows={filtered} sort={sort} onSort={onSort} timeframe={tf} />
      </div>
    </div>
  );
}
