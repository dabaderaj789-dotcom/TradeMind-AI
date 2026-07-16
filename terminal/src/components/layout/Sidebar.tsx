import { NavLink } from "react-router-dom";
import { usePrefs } from "../../store/prefs";
import { SidebarSearch } from "../sidebar/SidebarSearch";
import { SymbolRow } from "../sidebar/SymbolRow";
import { cx } from "../../lib/format";
import type { ReactNode } from "react";

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{title}</span>
        <span className="text-[10px] text-faint">{count}</span>
      </div>
      {children}
    </div>
  );
}

export function Sidebar() {
  const watchlist = usePrefs((s) => s.watchlist);
  const favorites = usePrefs((s) => s.favorites);
  const recents = usePrefs((s) => s.recents);
  const removeWatch = usePrefs((s) => s.removeWatch);

  return (
    <aside className="hidden lg:flex flex-col w-[264px] shrink-0 h-full border-r border-subtle/60 bg-surface">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-subtle/60">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand to-info flex items-center justify-center shadow-card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M17 7h4v4" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-content">TradeMind AI</div>
          <div className="text-[10px] uppercase tracking-widest text-brand/80">AI Terminal</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 pt-3">
        <NavItem to="/" label="Home" icon={<IconHome />} />
        <NavItem to="/scanner" label="Scanner" icon={<IconGrid />} />
        <NavItem to="/markets" label="Markets" icon={<IconMarkets />} />
        <NavItem to="/watchlist" label="Watchlist" icon={<IconStar />} />
        <NavItem to="/settings" label="Settings" icon={<IconGear />} />
      </nav>

      <div className="px-3 pt-4">
        <SidebarSearch />
      </div>

      {/* Lists */}
      <div className="flex-1 min-h-0 overflow-auto px-3 py-4 space-y-5">
        <Section title="Watchlist" count={watchlist.length}>
          {watchlist.length === 0 ? (
            <p className="px-1 text-xs text-faint">Search a symbol or open Markets.</p>
          ) : (
            <div className="space-y-0.5">
              {watchlist.map((s) => (
                <SymbolRow key={s.id} symbol={s} onRemove={removeWatch} />
              ))}
            </div>
          )}
        </Section>

        {favorites.length > 0 && (
          <Section title="Favorites" count={favorites.length}>
            <div className="space-y-0.5">
              {favorites.map((s) => (
                <SymbolRow key={s.id} symbol={s} />
              ))}
            </div>
          </Section>
        )}

        {recents.length > 0 && (
          <Section title="Recent" count={recents.length}>
            <div className="space-y-0.5">
              {recents.map((s) => (
                <SymbolRow key={s.id} symbol={s} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cx(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isActive ? "bg-brand/15 text-brand" : "text-muted hover:text-content hover:bg-elevated",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconMarkets() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14v4" />
      <path d="M12 10v8" />
      <path d="M17 6v12" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L6.9 14.3l-5-4.9 7-.9z" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
