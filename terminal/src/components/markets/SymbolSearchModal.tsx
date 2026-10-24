/**
 * Professional symbol search modal — indices / futures / options / crypto + recents/favorites.
 */

import { useMemo, useState } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { useSymbolSearch } from "../../hooks/queries";
import { useUniverseSymbols } from "../../hooks/useUniverseSymbols";
import { usePrefs } from "../../store/prefs";
import { useWorkspace } from "../../store/workspace";
import { cx } from "../../lib/format";
import { displayCode } from "../../lib/universe";
import type { SymbolLite } from "../../lib/types";

type Cat = "all" | "indices" | "futures" | "options" | "crypto" | "recent" | "favorites";

const CATS: Array<{ id: Cat; label: string }> = [
  { id: "all", label: "All" },
  { id: "indices", label: "Indices" },
  { id: "futures", label: "Futures" },
  { id: "options", label: "Options" },
  { id: "crypto", label: "Crypto" },
  { id: "recent", label: "Recent" },
  { id: "favorites", label: "Favorites" },
];

export function SymbolSearchModal() {
  const open = useWorkspace((s) => s.symbolSearchOpen);
  const setOpen = useWorkspace((s) => s.setSymbolSearchOpen);
  const openRight = useWorkspace((s) => s.openRightPanel);
  const select = useSelectSymbol();
  const recents = usePrefs((s) => s.recents);
  const favorites = usePrefs((s) => s.favorites);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const isFavorite = usePrefs((s) => s.isFavorite);
  const { items: universe } = useUniverseSymbols();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Cat>("all");
  const debounced = useDebounce(q, 160);

  const nseQ = useSymbolSearch(debounced, "nse", open && cat !== "crypto");
  const binanceQ = useSymbolSearch(debounced, "binance", open && (cat === "all" || cat === "crypto"));
  const forexQ = useSymbolSearch(debounced, "forex", open && cat === "all");

  const apiHits = useMemo(() => {
    const list = [
      ...(nseQ.data?.items ?? []),
      ...(binanceQ.data?.items ?? []),
      ...(forexQ.data?.items ?? []),
    ];
    const seen = new Set<string>();
    return list.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [nseQ.data, binanceQ.data, forexQ.data]);

  const rows = useMemo(() => {
    if (cat === "recent") return recents;
    if (cat === "favorites") return favorites;

    const fromUniverse: SymbolLite[] = universe
      .filter((u) => u.lite)
      .map((u) => u.lite!);

    const synthetic: Array<SymbolLite & { kind?: string }> = [];
    for (const u of universe) {
      if (!u.lite) continue;
      const code = u.code.toUpperCase();
      if (["NIFTY50", "BANKNIFTY", "SENSEX"].includes(code)) {
        const base = code === "NIFTY50" ? "NIFTY" : code;
        synthetic.push({
          ...u.lite,
          id: `${u.lite.id}:index`,
          name: `${base} Index`,
          symbol_code: u.lite.symbol_code,
          kind: "indices",
        } as SymbolLite & { kind: string });
        synthetic.push({
          ...u.lite,
          id: `${u.lite.id}:fut`,
          name: `${base} Futures`,
          symbol_code: `${base} FUT`,
          kind: "futures",
        } as SymbolLite & { kind: string });
        synthetic.push({
          ...u.lite,
          id: `${u.lite.id}:opt`,
          name: `${base} Options`,
          symbol_code: `${base} OPT`,
          kind: "options",
        } as SymbolLite & { kind: string });
      } else if (code === "BTCUSDT" || u.exchange === "binance") {
        synthetic.push({ ...u.lite, kind: "crypto" } as SymbolLite & { kind: string });
      } else {
        synthetic.push({ ...u.lite, kind: "indices" } as SymbolLite & { kind: string });
      }
    }

    let base: Array<SymbolLite & { kind?: string }> =
      debounced.trim().length > 0
        ? apiHits.map((s) => ({
            id: s.id,
            symbol_code: s.symbol_code,
            name: s.name,
            exchange_code: s.exchange_code,
            kind:
              s.exchange_code === "binance"
                ? "crypto"
                : /fut/i.test(s.symbol_code)
                  ? "futures"
                  : /ce|pe|opt/i.test(s.symbol_code)
                    ? "options"
                    : "indices",
          }))
        : synthetic.length
          ? synthetic
          : fromUniverse;

    if (cat === "indices") base = base.filter((r) => (r as { kind?: string }).kind === "indices" || /nifty|sensex|index/i.test(r.symbol_code + (r.name ?? "")));
    if (cat === "futures") base = base.filter((r) => (r as { kind?: string }).kind === "futures" || /fut/i.test(r.symbol_code + (r.name ?? "")));
    if (cat === "options") base = base.filter((r) => (r as { kind?: string }).kind === "options" || /opt|ce|pe/i.test(r.symbol_code + (r.name ?? "")));
    if (cat === "crypto") base = base.filter((r) => (r as { kind?: string }).kind === "crypto" || r.exchange_code === "binance");

    const qLower = debounced.trim().toLowerCase();
    if (qLower) {
      base = base.filter(
        (r) =>
          r.symbol_code.toLowerCase().includes(qLower) ||
          (r.name ?? "").toLowerCase().includes(qLower),
      );
    }
    return base.slice(0, 60);
  }, [cat, recents, favorites, universe, apiHits, debounced]);

  if (!open) return null;

  const pick = (s: SymbolLite & { kind?: string }) => {
    const realId = s.id.includes(":") ? s.id.split(":")[0] : s.id;
    const real: SymbolLite = {
      id: realId,
      symbol_code: s.symbol_code.replace(/\s+(FUT|OPT)$/i, ""),
      name: s.name,
      exchange_code: s.exchange_code,
    };
    // Resolve universe lite for index codes
    const u = universe.find((x) => x.lite?.id === realId || x.code === real.symbol_code || x.lite?.symbol_code === real.symbol_code);
    const target = u?.lite ?? real;
    select(target);
    if (s.kind === "options" || /OPT/i.test(s.symbol_code)) {
      openRight("options");
    }
    setOpen(false);
    setQ("");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-bg/70 px-3 pt-[12vh] backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close search" onClick={() => setOpen(false)} />
      <div className="relative z-10 flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-subtle bg-surface shadow-pop">
        <div className="border-b border-subtle/50 p-3">
          <input
            autoFocus
            className="input w-full"
            placeholder="Search NIFTY, BANKNIFTY, BTC…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {CATS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cx("btn-chip !px-2 !text-[10px]", cat === c.id && "btn-chip-active")}
                onClick={() => setCat(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto">
          {rows.map((s) => {
            const kind = (s as { kind?: string }).kind;
            const favId = s.id.includes(":") ? s.id.split(":")[0] : s.id;
            return (
              <li key={s.id} className="flex items-center gap-1 border-b border-subtle/25">
                <button
                  type="button"
                  className="min-w-0 flex-1 px-3 py-2.5 text-left hover:bg-elevated"
                  onClick={() => pick(s as SymbolLite & { kind?: string })}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-content">
                      {displayCode(s.symbol_code) || s.symbol_code}
                    </span>
                    <span className="rounded bg-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase text-faint">
                      {s.exchange_code || "—"}
                    </span>
                    {kind && (
                      <span className="rounded bg-elevated px-1.5 py-0.5 text-[9px] font-semibold uppercase text-faint">
                        {kind}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted">{s.name}</div>
                </button>
                <button
                  type="button"
                  className="btn-chip mr-2 !px-2"
                  title="Favorite"
                  onClick={() =>
                    toggleFavorite({
                      id: favId,
                      symbol_code: s.symbol_code,
                      name: s.name,
                      exchange_code: s.exchange_code,
                    })
                  }
                >
                  {isFavorite(favId) ? "★" : "☆"}
                </button>
              </li>
            );
          })}
          {!rows.length && (
            <li className="px-4 py-10 text-center text-sm text-muted">No symbols match.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
