import { useAuth } from "../context/AuthContext";
import type { Timeframe } from "../lib/api";
import { fmtRelative } from "../lib/format";
import type { Symbol, WatchItem } from "../lib/types";
import SymbolSearch from "./SymbolSearch";
import TimeframeSelector from "./TimeframeSelector";

export default function Header({
  symbol,
  timeframe,
  onSelectSymbol,
  onTimeframeChange,
  onRefresh,
  refreshing,
  lastUpdated,
}: {
  symbol: WatchItem | null;
  timeframe: Timeframe;
  onSelectSymbol: (s: Symbol) => void;
  onTimeframeChange: (tf: Timeframe) => void;
  onRefresh: () => void;
  refreshing: boolean;
  lastUpdated: string | null;
}) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 px-4 lg:px-6 h-16 border-b border-base-800 bg-base-900/90 backdrop-blur">
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M17 7h4v4" />
          </svg>
        </div>
        <div className="hidden md:block leading-tight">
          <div className="text-sm font-semibold text-slate-100">TradeMind AI</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Dashboard</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SymbolSearch onSelect={onSelectSymbol} />
        {symbol && (
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-slate-100 truncate">{symbol.symbol_code}</span>
            <span className="text-xs text-slate-500 truncate hidden lg:inline">{symbol.name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
        <button className="btn-ghost" onClick={onRefresh} disabled={refreshing || !symbol}>
          <svg
            className={refreshing ? "animate-spin" : ""}
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
          <span className="hidden md:inline">Refresh</span>
        </button>
        {lastUpdated && (
          <span className="hidden xl:inline text-xs text-slate-500">Updated {fmtRelative(lastUpdated)}</span>
        )}
        <div className="flex items-center gap-2 pl-3 border-l border-base-800">
          <div className="h-8 w-8 rounded-full bg-base-700 flex items-center justify-center text-xs font-semibold text-slate-200 uppercase">
            {(user ?? "?").slice(0, 1)}
          </div>
          <button className="text-slate-500 hover:text-slate-200" title="Sign out" onClick={logout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
