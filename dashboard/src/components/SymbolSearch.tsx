import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Symbol } from "../lib/types";

export default function SymbolSearch({
  onSelect,
}: {
  onSelect: (symbol: Symbol) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Symbol[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.searchSymbols(query.trim());
        if (!cancelled) setResults(res.items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (symbol: Symbol) => {
    onSelect(symbol);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          className="input pl-9"
          placeholder="Search symbol (e.g. BTC)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (query.trim().length > 0) && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto card p-1">
          {loading && <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">No symbols found.</div>
          )}
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => pick(s)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-base-800 flex items-center justify-between gap-3"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium text-slate-100">{s.symbol_code}</span>
                <span className="text-xs text-slate-500 truncate max-w-[180px]">{s.name}</span>
              </span>
              <span className="text-[10px] uppercase text-slate-500 shrink-0">{s.exchange_code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
