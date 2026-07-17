import { NavLink, useLocation, useParams } from "react-router-dom";
import { usePrefs } from "../../store/prefs";
import { cx } from "../../lib/format";
import type { ReactNode } from "react";

export function MobileNav() {
  const { symbolId } = useParams();
  const location = useLocation();
  const recents = usePrefs((s) => s.recents);
  const watchlist = usePrefs((s) => s.watchlist);
  const chartId = symbolId || recents[0]?.id || watchlist[0]?.id;
  const chartTo = chartId ? `/terminal/${chartId}` : "/markets";

  const items: {
    to: string;
    label: string;
    icon: ReactNode;
    end?: boolean;
    active?: boolean;
  }[] = [
    { to: "/", label: "Home", icon: <IconHome />, end: true },
    { to: "/markets", label: "Markets", icon: <IconMarkets /> },
    {
      to: chartTo,
      label: "Chart",
      icon: <IconChart />,
      active: location.pathname.startsWith("/terminal"),
    },
    { to: "/watchlist", label: "Watchlist", icon: <IconStar /> },
    { to: "/settings", label: "Settings", icon: <IconGear /> },
  ];

  return (
    <nav
      className="terminal-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-subtle/50 bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {items.map((item) => (
          <li key={item.label} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  "flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors",
                  (item.active ?? isActive) ? "text-brand" : "text-faint hover:text-content",
                )
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </svg>
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

function IconStar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L6.9 14.3l-5-4.9 7-.9z" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
