/**
 * Desk top header — TradeMind branding + search + primary nav (mockup IA).
 */

import { Link, useNavigate } from "react-router-dom";
import { ConnectionStatusChip } from "../shell/ConnectionStatus";
import { TopBarActions } from "./TopBarActions";
import { TradeMindLogo } from "../brand/TradeMindLogo";
import { useSettings } from "../../store/settings";
import { DECISION_PROFILES, type DecisionProfileId } from "../../lib/decisionProfiles";
import { cx, fmtSignedPct } from "../../lib/format";
import { useWorkspace, type DeskWorkspace } from "../../store/workspace";

const PRIMARY_NAV: Array<{
  id: string;
  label: string;
  workspace?: DeskWorkspace;
  href?: string;
  openWatchlist?: boolean;
}> = [
  { id: "markets", label: "Markets", openWatchlist: true },
  { id: "trade", label: "Chart", workspace: "chart" },
  { id: "options", label: "Options", workspace: "options" },
  { id: "ai", label: "Desk", workspace: "ai" },
];

export function DeskHeader({
  symbolCode,
  price,
  dayChange,
  freshnessLabel,
  live,
}: {
  symbolCode: string;
  price: string;
  dayChange: number;
  freshnessLabel: string;
  live: boolean;
}) {
  const setSymbolSearchOpen = useWorkspace((s) => s.setSymbolSearchOpen);
  const openDesk = useWorkspace((s) => s.openDeskWorkspace);
  const deskWorkspace = useWorkspace((s) => s.deskWorkspace);
  const bottomTab = useWorkspace((s) => s.bottomTab);
  const bottomOpen = useWorkspace((s) => s.bottomOpen);
  const rightPanelTab = useWorkspace((s) => s.rightPanelTab);
  const rightPanelOpen = useWorkspace((s) => s.rightPanelOpen);
  const profile = useSettings((s) => s.decisionProfile);
  const setProfile = useSettings((s) => s.setDecisionProfile);
  const navigate = useNavigate();

  const goWorkspace = (item: (typeof PRIMARY_NAV)[number]) => {
    if (item.href) {
      navigate(item.href);
      return;
    }
    if (item.openWatchlist) {
      useWorkspace.getState().setWatchlistOpen(true);
      return;
    }
    if (item.workspace) openDesk(item.workspace);
  };

  const isNavActive = (item: (typeof PRIMARY_NAV)[number]) => {
    if (item.href) return false;
    if (item.openWatchlist) return useWorkspace.getState().watchlistOpen;
    if (item.workspace === "chart") return deskWorkspace === "chart" || deskWorkspace === "markets";
    if (item.workspace === "options") return bottomOpen && bottomTab === "options";
    if (item.workspace === "depth") return bottomOpen && bottomTab === "depth";
    if (item.workspace === "ai") return rightPanelOpen && rightPanelTab === "ai";
    if (item.workspace === "orders") return bottomOpen && bottomTab === "orders";
    if (item.workspace === "positions") return bottomOpen && bottomTab === "positions";
    if (item.workspace === "portfolio") return bottomOpen && bottomTab === "portfolio";
    if (item.workspace === "journal") return bottomOpen && bottomTab === "journal";
    return deskWorkspace === item.workspace;
  };

  return (
    <header className="desk-header">
      <Link
        to="/"
        className="shrink-0"
        title="TradeMind AI"
      >
        <TradeMindLogo size={28} withWordmark />
      </Link>

      <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Primary">
        {PRIMARY_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cx("desk-nav-link", isNavActive(item) && "desk-nav-link-active")}
            onClick={() => goWorkspace(item)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="desk-search"
        onClick={() => setSymbolSearchOpen(true)}
        title="Search symbols (Ctrl+K)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="truncate">Search</span>
        <kbd className="ml-auto hidden rounded border border-subtle px-1.5 py-0.5 font-mono text-[9px] text-faint sm:inline">
          Ctrl+K
        </kbd>
      </button>

      <button
        type="button"
        className="flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1 hover:bg-elevated"
        onClick={() => setSymbolSearchOpen(true)}
      >
        <span className="hidden font-display text-[13px] font-semibold text-content lg:inline">{symbolCode}</span>
        <span
          className={cx(
            "font-mono text-[15px] font-bold tabular-nums",
            dayChange >= 0 ? "text-bull" : "text-bear",
          )}
        >
          {price}
        </span>
        <span className={cx("font-mono text-[11px] font-semibold tabular-nums", dayChange >= 0 ? "text-bull" : "text-bear")}>
          {fmtSignedPct(dayChange)}
        </span>
        <span
          className={cx(
            "rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide",
            live ? "bg-bull/10 text-bull" : "bg-elevated text-faint",
          )}
        >
          {live ? "LIVE" : freshnessLabel}
        </span>
      </button>

      <ConnectionStatusChip compact />

      <div className="ml-auto flex items-center gap-1">
        <div className="hidden items-center rounded-md border border-subtle p-0.5 2xl:flex">
          {DECISION_PROFILES.filter((p) => p.implemented).map((p) => (
            <button
              key={p.id}
              type="button"
              className={cx(
                "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                profile === p.id ? "bg-brand text-white" : "text-faint hover:text-content",
              )}
              onClick={() => setProfile(p.id as DecisionProfileId)}
              title={p.label}
            >
              {p.short}
            </button>
          ))}
        </div>
        <TopBarActions />
      </div>
    </header>
  );
}
