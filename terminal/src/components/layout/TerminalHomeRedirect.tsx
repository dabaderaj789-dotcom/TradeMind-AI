/**
 * Post-login landing: go straight to the trading terminal (last recent or NIFTY).
 */

import { Navigate } from "react-router-dom";
import { Spinner } from "../common/primitives";
import { useUniverseSymbols } from "../../hooks/useUniverseSymbols";
import { usePrefs } from "../../store/prefs";

export function TerminalHomeRedirect() {
  const recents = usePrefs((s) => s.recents);
  const watchlist = usePrefs((s) => s.watchlist);
  const { ready, isLoading } = useUniverseSymbols();

  const liveIds = new Set(ready.map((u) => u.lite?.id).filter(Boolean));
  const nifty = ready.find((u) => u.code === "NIFTY50")?.lite?.id;
  const recentLive = recents.find((r) => liveIds.has(r.id))?.id;
  const id =
    nifty ||
    recentLive ||
    ready.find((u) => u.code === "BANKNIFTY")?.lite?.id ||
    ready[0]?.lite?.id ||
    watchlist.find((w) => liveIds.has(w.id))?.id;

  if (isLoading && !id) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Opening terminal…" />
      </div>
    );
  }

  if (id) return <Navigate to={`/terminal/${id}`} replace />;
  return <Navigate to="/markets" replace />;
}
