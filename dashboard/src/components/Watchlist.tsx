import type { WatchItem } from "../lib/types";
import { fmtPrice } from "../lib/format";
import { Card, EmptyState } from "./ui";

export default function Watchlist({
  items,
  activeId,
  quotes,
  onSelect,
  onRemove,
  onAddCurrent,
  canAddCurrent,
}: {
  items: WatchItem[];
  activeId: string | null;
  quotes: Record<string, number | undefined>;
  onSelect: (item: WatchItem) => void;
  onRemove: (id: string) => void;
  onAddCurrent: () => void;
  canAddCurrent: boolean;
}) {
  return (
    <Card
      title="Watchlist"
      actions={
        <button
          className="text-xs text-brand-400 hover:text-brand-500 disabled:opacity-40"
          onClick={onAddCurrent}
          disabled={!canAddCurrent}
        >
          + Add current
        </button>
      }
    >
      {items.length === 0 ? (
        <EmptyState>Your watchlist is empty. Search a symbol and add it.</EmptyState>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => {
            const price = quotes[item.id];
            const active = item.id === activeId;
            return (
              <li
                key={item.id}
                className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2 cursor-pointer border ${
                  active ? "bg-base-800 border-brand-500/40" : "border-transparent hover:bg-base-850"
                }`}
                onClick={() => onSelect(item)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{item.symbol_code}</div>
                  <div className="text-[11px] text-slate-500 truncate">{item.name}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-slate-300">
                    {price != null ? fmtPrice(price) : "—"}
                  </span>
                  <button
                    className="text-slate-600 hover:text-bear opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.id);
                    }}
                    title="Remove"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
