import { useEffect, useMemo, useState } from "react";
import { Spinner } from "../common/primitives";
import { useDebounce } from "../../hooks/useDebounce";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { useSymbolSearch } from "../../hooks/queries";
import {
  MARKET_TREE,
  classifyMarketLeaf,
  filterByLeaf,
  leafLabel,
  leafRoot,
  rankSymbolSearch,
  type MarketId,
  type MarketLeafId,
} from "../../lib/markets";
import { cx } from "../../lib/format";
import type { Symbol } from "../../lib/types";
import { usePrefs } from "../../store/prefs";

type Focus =
  | { kind: "root"; id: MarketId }
  | { kind: "leaf"; id: MarketLeafId }
  | { kind: "search" };

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0 text-faint transition-transform duration-150", open && "rotate-90")}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function MarketBrowser() {
  const select = useSelectSymbol();
  const setMarketCategory = usePrefs((s) => s.setMarketCategory);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 180);
  const searching = debounced.trim().length > 0;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    india: true,
    crypto: true,
  });
  const [focus, setFocus] = useState<Focus>({ kind: "leaf", id: "crypto.spot" });

  const { data, isLoading, isError, refetch, isFetching } = useSymbolSearch("", "", true);

  const allSymbols = useMemo(() => (data?.items ?? []) as Symbol[], [data?.items]);

  const counts = useMemo(() => {
    const map = new Map<MarketLeafId | MarketId, number>();
    for (const s of allSymbols) {
      const leaf = classifyMarketLeaf(s);
      map.set(leaf, (map.get(leaf) ?? 0) + 1);
      const root = leafRoot(leaf);
      map.set(root, (map.get(root) ?? 0) + 1);
    }
    return map;
  }, [allSymbols]);

  const searchHits = useMemo(() => {
    if (!searching) return [];
    return rankSymbolSearch(allSymbols, debounced).slice(0, 80);
  }, [allSymbols, debounced, searching]);

  useEffect(() => {
    if (searching) setFocus({ kind: "search" });
  }, [searching]);

  const listSymbols = useMemo(() => {
    if (focus.kind === "search") return searchHits;
    if (focus.kind === "leaf") return filterByLeaf(allSymbols, focus.id);
    // Root with no children (forex/commodities/indices) or aggregate
    const node = MARKET_TREE.find((n) => n.id === focus.id);
    if (!node?.children) {
      return allSymbols.filter((s) => leafRoot(classifyMarketLeaf(s)) === focus.id);
    }
    return allSymbols.filter((s) => leafRoot(classifyMarketLeaf(s)) === focus.id);
  }, [allSymbols, focus, searchHits]);

  const listTitle = useMemo(() => {
    if (focus.kind === "search") return `Search · “${debounced.trim()}”`;
    if (focus.kind === "leaf") return leafLabel(focus.id);
    return MARKET_TREE.find((n) => n.id === focus.id)?.label ?? "Markets";
  }, [focus, debounced]);

  const openSymbol = (s: Symbol) => {
    const leaf = classifyMarketLeaf(s);
    setMarketCategory(leafRoot(leaf));
    select({
      id: s.id,
      symbol_code: s.symbol_code,
      name: s.name,
      exchange_code: s.exchange_code,
    });
  };

  const toggleRoot = (id: MarketId) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Global search */}
      <div className="shrink-0 border-b border-subtle/60 bg-surface px-4 py-3 lg:px-6">
        <div className="relative max-w-2xl">
          <SearchIcon />
          <input
            className="input h-11 pl-10 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search markets — BTC, NIFTY, Reliance…"
            aria-label="Search all markets"
            autoFocus
          />
          {q && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint hover:text-content"
              onClick={() => setQ("")}
            >
              Clear
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Search across all markets · click a symbol to open the Trading Terminal
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Category tree */}
        {!searching && (
          <aside className="shrink-0 border-b border-subtle/60 lg:w-[240px] lg:border-b-0 lg:border-r lg:overflow-y-auto bg-surface/40">
            <div className="px-2 py-2 lg:py-3">
              <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                Markets
              </div>
              <ul className="space-y-0.5">
                {MARKET_TREE.map((node) => {
                  const open = !!expanded[node.id];
                  const hasChildren = !!node.children?.length;
                  const rootActive = focus.kind === "root" && focus.id === node.id;
                  const rootCount = counts.get(node.id) ?? 0;

                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (hasChildren) {
                            toggleRoot(node.id);
                            if (!open) setFocus({ kind: "root", id: node.id });
                          } else {
                            setFocus({ kind: "root", id: node.id });
                          }
                        }}
                        className={cx(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          rootActive && !hasChildren
                            ? "bg-brand/15 text-brand"
                            : "text-content hover:bg-elevated",
                        )}
                      >
                        {hasChildren ? <Chevron open={open} /> : <span className="w-3" />}
                        <span className="min-w-0 flex-1 font-medium truncate">{node.label}</span>
                        <span className="tabular-nums text-[10px] text-faint">{rootCount || ""}</span>
                      </button>

                      {hasChildren && open && (
                        <ul className="ml-3 border-l border-subtle/50 pl-1 py-0.5 space-y-0.5">
                          {node.children!.map((child) => {
                            const active = focus.kind === "leaf" && focus.id === child.id;
                            const n = counts.get(child.id) ?? 0;
                            return (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocus({ kind: "leaf", id: child.id });
                                    setMarketCategory(node.id);
                                  }}
                                  className={cx(
                                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                                    active
                                      ? "bg-brand/15 text-brand font-medium"
                                      : "text-muted hover:bg-elevated hover:text-content",
                                  )}
                                >
                                  <span>{child.label}</span>
                                  <span className="tabular-nums text-[10px] text-faint">{n}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        )}

        {/* Symbol list */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-subtle/50 px-4">
            <div className="text-xs font-semibold text-muted truncate">{listTitle}</div>
            <div className="text-[11px] tabular-nums text-faint">
              {isFetching ? "…" : `${listSymbols.length} symbols`}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {isLoading ? (
              <div className="p-8">
                <Spinner label="Loading markets…" />
              </div>
            ) : isError ? (
              <div className="m-4 rounded-lg border border-bear/30 bg-bear/5 p-4 text-sm text-muted">
                Couldn’t load markets.{" "}
                <button type="button" className="text-brand underline" onClick={() => void refetch()}>
                  Retry
                </button>
              </div>
            ) : listSymbols.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-16 text-center">
                <div className="text-sm font-medium text-content">
                  {searching ? "No matches" : "No symbols in this category"}
                </div>
                <p className="max-w-sm text-xs text-muted">
                  {searching
                    ? "Try BTC, ETH, NIFTY, or a company name like Reliance."
                    : "This category is ready for when more instruments are available."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-subtle/40">
                {listSymbols.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => openSymbol(s)}
                      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-elevated"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-content tracking-tight">
                            {s.symbol_code}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide text-faint">
                            {s.exchange_code}
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted">{s.name}</div>
                      </div>
                      <span className="shrink-0 text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                        Open chart
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
