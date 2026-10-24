/**
 * Mobile bottom nav — Markets · Chart · Options · AI · Trades
 */

import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { usePrefs } from "../../store/prefs";
import { useUniverseSymbols } from "../../hooks/useUniverseSymbols";
import { useWorkspace } from "../../store/workspace";
import { cx } from "../../lib/format";

export function MobileNav() {
  const { symbolId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const recents = usePrefs((s) => s.recents);
  const watchlist = usePrefs((s) => s.watchlist);
  const { ready } = useUniverseSymbols();
  const openRight = useWorkspace((s) => s.openRightPanel);
  const onTerminal = location.pathname.startsWith("/terminal");
  const chartId = symbolId || recents[0]?.id || watchlist[0]?.id || ready[0]?.lite?.id;
  const chartTo = chartId ? `/terminal/${chartId}` : "/markets";

  const openSheet = (tab: "options" | "ai" | "journal" | "orders") => {
    openRight(tab);
    if (!onTerminal && chartId) navigate(`/terminal/${chartId}`);
    else if (!onTerminal) navigate("/markets");
  };

  return (
    <nav
      className="terminal-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-subtle/40 bg-surface/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        <li className="flex-1">
          <NavLink
            to="/markets"
            className={({ isActive }) =>
              cx(
                "flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors",
                isActive ? "text-brand" : "text-faint hover:text-content",
              )
            }
          >
            <IconMarkets />
            <span>Markets</span>
          </NavLink>
        </li>
        <li className="flex-1">
          <NavLink
            to={chartTo}
            className={() =>
              cx(
                "flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors",
                onTerminal ? "text-brand" : "text-faint hover:text-content",
              )
            }
          >
            <IconChart />
            <span>Chart</span>
          </NavLink>
        </li>
        <li className="flex-1">
          <button
            type="button"
            className="flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium text-faint hover:text-content"
            onClick={() => openSheet("options")}
          >
            <IconOptions />
            <span>Options</span>
          </button>
        </li>
        <li className="flex-1">
          <button
            type="button"
            className="flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium text-faint hover:text-content"
            onClick={() => openSheet("ai")}
          >
            <IconAi />
            <span>AI</span>
          </button>
        </li>
        <li className="flex-1">
          <button
            type="button"
            className="flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium text-faint hover:text-content"
            onClick={() => openSheet("orders")}
          >
            <IconTrades />
            <span>Orders</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function IconMarkets() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14v4" />
      <path d="M12 10v8" />
      <path d="M17 6v12" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}

function IconOptions() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h10M4 18h7" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="15" cy="18" r="2" />
    </svg>
  );
}

function IconAi() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  );
}

function IconTrades() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
