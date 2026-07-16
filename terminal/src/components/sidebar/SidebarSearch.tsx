import { useEffect, useMemo, useRef, useState } from "react";
import { useSymbolSearch } from "../../hooks/queries";
import { useDebounce } from "../../hooks/useDebounce";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { classifyMarketLeaf, leafRoot, rankSymbolSearch } from "../../lib/markets";
import type { SymbolLite } from "../../lib/types";
import { usePrefs } from "../../store/prefs";

/** Global symbol search across all markets — opens Trading Terminal on pick. */
export function SidebarSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(query, 200);
  const select = useSelectSymbol();
  const setMarketCategory = usePrefs((s) => s.setMarketCategory);
  const boxRef = useRef<HTMLDivElement>(null);
  const searching = debounced.trim().length > 0;

  const { data, isFetching } = useSymbolSearch(searching ? debounced : "", "", searching);

  const items = useMemo(() => {
    if (!searching) return [];
    return rankSymbolSearch(data?.items ?? [], debounced).slice(0, 40);
  }, [data?.items, debounced, searching]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (s: SymbolLite & { market_type?: string; instrument?: string }) => {
    setMarketCategory(
      leafRoot(
        classifyMarketLeaf({
          symbol_code: s.symbol_code,
          name: s.name,
          market_type: s.market_type,
          exchange_code: s.exchange_code,
          instrument: s.instrument,
        }),
      ),
    );
    select({ id: s.id, symbol_code: s.symbol_code, name: s.name, exchange_code: s.exchange_code });
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          className="input pl-9"
          placeholder="Search BTC, NIFTY…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label="Search all markets"
        />
      </div>
      {open && searching && (
        <div className="absolute z-40 mt-1 w-full max-h-72 overflow-auto card p-1 animate-fade-in">
          {isFetching && <div className="px-3 py-2 text-sm text-muted">Searching…</div>}
          {!isFetching && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted">No symbols found.</div>
          )}
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                pick({
                  id: s.id,
                  symbol_code: s.symbol_code,
                  name: s.name,
                  exchange_code: s.exchange_code,
                  market_type: s.market_type,
                  instrument: s.instrument,
                })
              }
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between gap-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-content">{s.symbol_code}</span>
                <span className="block text-xs text-faint truncate">{s.name}</span>
              </span>
              <span className="text-[10px] uppercase text-faint shrink-0">{s.exchange_code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
