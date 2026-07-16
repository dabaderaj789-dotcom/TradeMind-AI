import { useParams } from "react-router-dom";
import { useSelectSymbol } from "../../hooks/useSelectSymbol";
import { cx } from "../../lib/format";
import type { SymbolLite } from "../../lib/types";
import { usePrefs } from "../../store/prefs";

export function SymbolRow({ symbol, onRemove }: { symbol: SymbolLite; onRemove?: (id: string) => void }) {
  const { symbolId } = useParams();
  const select = useSelectSymbol();
  const isFavorite = usePrefs((s) => s.isFavorite);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const fav = isFavorite(symbol.id);
  const active = symbolId === symbol.id;

  return (
    <div
      className={cx(
        "group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer border transition-colors",
        active ? "bg-elevated border-brand/40" : "border-transparent hover:bg-elevated",
      )}
      onClick={() => select(symbol)}
    >
      <button
        className={cx("shrink-0 transition-colors", fav ? "text-warn" : "text-faint hover:text-warn")}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(symbol);
        }}
        title={fav ? "Remove from favorites" : "Add to favorites"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L6.9 14.3l-5-4.9 7-.9z" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-content truncate">{symbol.symbol_code}</div>
        <div className="text-[11px] text-faint truncate">{symbol.name}</div>
      </div>
      {onRemove && (
        <button
          className="shrink-0 text-faint hover:text-bear opacity-0 group-hover:opacity-100 transition"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(symbol.id);
          }}
          title="Remove"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
