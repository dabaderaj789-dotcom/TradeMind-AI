/**
 * Right desk panel — Watchlist | Options | AI | Journal | Depth | Orders | …
 */

import { AnalysisPanel } from "../analysis/AnalysisPanel";
import { OptionChainPanel } from "../options/OptionChainPanel";
import { JournalPanel } from "./JournalPanel";
import { WatchlistPanel } from "../desk/WatchlistPanel";
import { MarketDepthPanel } from "../desk/MarketDepthPanel";
import { OrdersBlotterPanel } from "../desk/OrdersBlotterPanel";
import { PositionsPanel } from "../desk/PositionsPanel";
import { PortfolioPanel } from "../desk/PortfolioPanel";
import { OrderTicketPanel } from "../desk/OrderTicketPanel";
import { AlertsDeskPanel } from "../desk/AlertsDeskPanel";
import { cx } from "../../lib/format";
import { useWorkspace, type RightPanelTab } from "../../store/workspace";
import type { Timeframe } from "../../lib/endpoints";
import { displayCode } from "../../lib/universe";

const TABS: Array<{ id: RightPanelTab; label: string }> = [
  { id: "watchlist", label: "Watch" },
  { id: "options", label: "Options" },
  { id: "ai", label: "AI" },
  { id: "journal", label: "Journal" },
  { id: "depth", label: "Depth" },
  { id: "orders", label: "Orders" },
  { id: "positions", label: "Pos" },
  { id: "portfolio", label: "Port" },
  { id: "ticket", label: "Ticket" },
  { id: "alerts", label: "Alerts" },
];

export function RightDeskPanel({
  symbolId,
  timeframe,
  symbolCode,
  width,
}: {
  symbolId: string;
  timeframe: Timeframe;
  symbolCode?: string;
  width: number;
}) {
  const tab = useWorkspace((s) => s.rightPanelTab);
  const setTab = useWorkspace((s) => s.setRightPanelTab);
  const setOpen = useWorkspace((s) => s.setRightPanelOpen);

  const optionsUnderlying =
    symbolCode?.toUpperCase().includes("BANK")
      ? "BANKNIFTY"
      : symbolCode?.toUpperCase().includes("SENSEX")
        ? "SENSEX"
        : symbolCode?.toUpperCase().includes("NIFTY")
          ? "NIFTY"
          : "NIFTY";

  const code = displayCode(symbolCode);

  return (
    <aside
      style={{ width }}
      className="flex h-full shrink-0 flex-col border-l border-subtle/50 bg-surface"
    >
      <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-subtle/40 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cx(
              "shrink-0 rounded px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide",
              tab === t.id ? "bg-brand/15 text-brand" : "text-faint hover:text-content",
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="btn-chip ml-auto !px-2"
          title="Close panel"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "watchlist" && <WatchlistPanel activeSymbolId={symbolId} />}
        {tab === "options" && <OptionChainPanel initialUnderlying={optionsUnderlying} compact />}
        {tab === "ai" && symbolId && <AnalysisPanel id={symbolId} tf={timeframe} />}
        {tab === "journal" && <JournalPanel />}
        {tab === "depth" && <MarketDepthPanel symbolCode={code} />}
        {tab === "orders" && <OrdersBlotterPanel />}
        {tab === "positions" && <PositionsPanel />}
        {tab === "portfolio" && <PortfolioPanel />}
        {tab === "ticket" && <OrderTicketPanel symbolCode={code} />}
        {tab === "alerts" && <AlertsDeskPanel />}
      </div>
    </aside>
  );
}

export function rightPanelTitle(tab: RightPanelTab, symbolCode?: string) {
  if (tab === "options") return `Options · ${displayCode(symbolCode) || "Index"}`;
  return TABS.find((t) => t.id === tab)?.label ?? tab;
}
