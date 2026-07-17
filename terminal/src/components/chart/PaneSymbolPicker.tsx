/**
 * Per-pane symbol picker — assigns an independent symbol without shared-state bugs.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrefs } from "../../store/prefs";
import { useWorkspace } from "../../store/workspace";
import { cx } from "../../lib/format";

export function PaneSymbolPicker({
  paneId,
  symbolCode,
  compact = false,
}: {
  paneId: string;
  symbolCode?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setPaneSymbol = useWorkspace((s) => s.setPaneSymbol);
  const setActivePane = useWorkspace((s) => s.setActivePane);
  const layout = useWorkspace((s) => s.layout);
  const navigate = useNavigate();
  const watchlist = usePrefs((s) => s.watchlist);
  const favorites = usePrefs((s) => s.favorites);
  const recents = usePrefs((s) => s.recents);

  const options = useMemo(() => {
    const map = new Map<string, { id: string; symbol_code: string; name: string }>();
    for (const s of [...favorites, ...watchlist, ...recents]) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    return [...map.values()].slice(0, 40);
  }, [favorites, watchlist, recents]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        className={cx(
          "truncate font-semibold text-content hover:text-brand",
          compact ? "max-w-[72px] text-xs" : "max-w-[120px] text-sm",
        )}
        title="Change pane symbol"
        onClick={() => setOpen((v) => !v)}
      >
        {symbolCode ?? "Symbol ▾"}
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-subtle/50 bg-surface p-1.5 shadow-pop animate-fade-in">
          {options.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-muted">
              Open Markets and pick symbols to populate this list.
            </div>
          ) : (
            options.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-elevated"
                onClick={() => {
                  setActivePane(paneId);
                  setPaneSymbol(paneId, s.id);
                  // Keep URL in sync for primary/single layout navigation.
                  if (layout === "1") navigate(`/terminal/${s.id}`);
                  setOpen(false);
                }}
              >
                <span className="text-xs font-semibold text-content">{s.symbol_code}</span>
                <span className="truncate text-[10px] text-faint">{s.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
