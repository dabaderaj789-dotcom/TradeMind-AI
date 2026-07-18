import { NavLink, useLocation, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { cx } from "../../lib/format";
import { usePrefs } from "../../store/prefs";
import { useUniverseSymbols } from "../../hooks/useUniverseSymbols";

export function IconRail() {
  const location = useLocation();
  const { symbolId } = useParams();
  const recents = usePrefs((s) => s.recents);
  const watchlist = usePrefs((s) => s.watchlist);
  const { ready } = useUniverseSymbols();
  const onTerminal = location.pathname.startsWith("/terminal");
  const chartId = symbolId || recents[0]?.id || watchlist[0]?.id || ready[0]?.lite?.id;
  const chartTo = chartId ? `/terminal/${chartId}` : "/markets";

  return (
    <aside className="terminal-rail hidden h-full w-[52px] shrink-0 flex-col items-center border-r border-subtle/40 bg-surface py-3 lg:flex">
      <NavLink
        to="/"
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-bg shadow-glow"
        title="TradeMind AI"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M17 7h4v4" />
        </svg>
      </NavLink>

      <nav className="flex flex-1 flex-col items-center gap-1">
        <RailLink to="/" end label="Dashboard" icon={<IconHome />} />
        <RailLink to="/markets" label="Markets" icon={<IconMarkets />} />
        <RailLink to={chartTo} label="Chart" icon={<IconChart />} active={onTerminal} />
        <RailLink to="/watchlist" label="Watchlist" icon={<IconStar />} />
        <div className="flex-1" />
        <RailLink to="/settings" label="Settings" icon={<IconGear />} />
      </nav>

      <div className="mt-2 text-[8px] font-semibold tracking-[0.2em] text-faint">V4</div>
    </aside>
  );
}

function RailLink({
  to,
  label,
  icon,
  end,
  active,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  active?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) => cx("v2-rail-btn", (active ?? isActive) && "v2-rail-btn-active")}
    >
      {icon}
    </NavLink>
  );
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}

function IconMarkets() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14v4" />
      <path d="M12 10v8" />
      <path d="M17 6v12" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L6.9 14.3l-5-4.9 7-.9z" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
