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
  | { kind: "none" }
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
      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
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

/** Mobile-first: roots collapsed → expand categories → tap leaf for symbols. */
export function MarketBrowser() {
  const select = useSelectSymbol();
  const setMarketCategory = usePrefs((s) => s.setMarketCategory);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 180);
  const searching = debounced.trim().length > 0;

  // All markets collapsed by default — no auto-expand.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<Focus>({ kind: "none" });

  const nseQ = useSymbolSearch("", "nse", true);
  const binanceQ = useSymbolSearch("", "binance", true);
  const isLoading = nseQ.isLoading || binanceQ.isLoading;
  const isError = nseQ.isError && binanceQ.isError;
  const isFetching = nseQ.isFetching || binanceQ.isFetching;
  const refetch = () => {
    void nseQ.refetch();
    void binanceQ.refetch();
  };

  const allSymbols = useMemo(() => {
    const map = new Map<string, Symbol>();
    for (const s of [...(nseQ.data?.items ?? []), ...(binanceQ.data?.items ?? [])] as Symbol[]) {
      map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [nseQ.data?.items, binanceQ.data?.items]);

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
    else if (focus.kind === "search") setFocus({ kind: "none" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to search toggle
  }, [searching]);

  const showSymbols =
    searching || focus.kind === "leaf" || (focus.kind === "root" && !MARKET_TREE.find((n) => n.id === focus.id)?.children);

  const listSymbols = useMemo(() => {
    if (focus.kind === "search") return searchHits;
    if (focus.kind === "leaf") return filterByLeaf(allSymbols, focus.id);
    if (focus.kind === "root") {
      return allSymbols.filter((s) => leafRoot(classifyMarketLeaf(s)) === focus.id);
    }
    return [];
  }, [allSymbols, focus, searchHits]);

  const listTitle = useMemo(() => {
    if (focus.kind === "search") return `Search · “${debounced.trim()}”`;
    if (focus.kind === "leaf") return leafLabel(focus.id);
    if (focus.kind === "root") return MARKET_TREE.find((n) => n.id === focus.id)?.label ?? "Markets";
    return "Select a market";
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
    setExpanded((e) => {
      const nextOpen = !e[id];
      // Accordion: one root open at a time on mobile for less scrolling.
      if (nextOpen) return { [id]: true };
      return { ...e, [id]: false };
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-subtle/60 bg-surface px-4 py-3 lg:px-6">
        <div className="relative max-w-2xl">
          <SearchIcon />
          <input
            className="input h-11 pl-10 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search markets — BTC, NIFTY, Reliance…"
            aria-label="Search all markets"
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Category tree — always visible on desktop; on mobile hide when showing symbols */}
        {!searching && (
          <aside
            className={cx(
              "shrink-0 border-b border-subtle/60 bg-surface/40 lg:w-[240px] lg:border-b-0 lg:border-r lg:overflow-y-auto",
              showSymbols && "hidden lg:block",
            )}
          >
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
                            else setFocus({ kind: "none" });
                          } else {
                            setFocus({ kind: "root", id: node.id });
                            setMarketCategory(node.id);
                          }
                        }}
                        className={cx(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left text-sm transition-colors lg:py-2",
                          rootActive && !hasChildren
                            ? "bg-brand/15 text-brand"
                            : "text-content hover:bg-elevated",
                        )}
                      >
                        {hasChildren ? <Chevron open={open} /> : <span className="w-3" />}
                        <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
                        <span className="tabular-nums text-[10px] text-faint">{rootCount || ""}</span>
                      </button>

                      {hasChildren && open && (
                        <ul className="ml-3 space-y-0.5 border-l border-subtle/50 py-0.5 pl-1">
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
                                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors lg:py-1.5",
                                    active
                                      ? "bg-brand/15 font-medium text-brand"
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

        {/* Symbol list — only after leaf/root pick or search */}
        <section
          className={cx(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            !showSymbols && "hidden lg:flex",
          )}
        >
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-subtle/50 px-3 lg:px-4">
            <div className="flex min-w-0 items-center gap-2">
              {showSymbols && !searching && (
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-xs text-muted hover:bg-elevated hover:text-content lg:hidden"
                  onClick={() => {
                    if (focus.kind === "leaf") {
                      const root = leafRoot(focus.id);
                      setExpanded({ [root]: true });
                      setFocus({ kind: "root", id: root });
                    } else {
                      setFocus({ kind: "none" });
                      setExpanded({});
                    }
                  }}
                >
                  ← Back
                </button>
              )}
              <div className="truncate text-xs font-semibold text-muted">{listTitle}</div>
            </div>
            {showSymbols && (
              <div className="text-[11px] tabular-nums text-faint">
                {isFetching ? "…" : `${listSymbols.length}`}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {!showSymbols ? (
              <div className="hidden flex-col items-center justify-center gap-1 px-6 py-16 text-center lg:flex">
                <div className="text-sm font-medium text-content">Pick a market</div>
                <p className="max-w-sm text-xs text-muted">
                  Expand a market, then choose a category to browse symbols.
                </p>
              </div>
            ) : isLoading ? (
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
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated lg:py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold tracking-tight text-content">
                            {s.symbol_code}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide text-faint">
                            {s.exchange_code}
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted">{s.name}</div>
                      </div>
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
