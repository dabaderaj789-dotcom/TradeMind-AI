import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { classifyMarketLeaf, leafRoot } from "../lib/markets";
import type { SymbolLite } from "../lib/types";
import { usePrefs } from "../store/prefs";

/** Navigates to a symbol's terminal and records it as recently viewed. */
export function useSelectSymbol() {
  const navigate = useNavigate();
  const pushRecent = usePrefs((s) => s.pushRecent);
  const setMarketCategory = usePrefs((s) => s.setMarketCategory);
  return useCallback(
    (s: SymbolLite) => {
      setMarketCategory(
        leafRoot(
          classifyMarketLeaf({
            symbol_code: s.symbol_code,
            name: s.name,
            exchange_code: s.exchange_code,
          }),
        ),
      );
      pushRecent(s);
      navigate(`/terminal/${s.id}`);
    },
    [navigate, pushRecent, setMarketCategory],
  );
}
