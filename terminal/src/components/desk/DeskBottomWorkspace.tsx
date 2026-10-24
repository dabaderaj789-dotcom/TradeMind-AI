/**
 * Bottom trading workspace — Option Chain / Orders / Positions / Journal / Alerts / Analysis.
 * Real data where APIs exist; honest unavailable for broker-only surfaces.
 */

import { OptionChainPanel } from "../options/OptionChainPanel";
import { OrdersBlotterPanel } from "./OrdersBlotterPanel";
import { PositionsPanel } from "./PositionsPanel";
import { OrderTicketPanel } from "./OrderTicketPanel";
import { PortfolioPanel } from "./PortfolioPanel";
import { MarketDepthPanel } from "./MarketDepthPanel";
import { JournalPanel } from "../layout/JournalPanel";
import { AlertsDeskPanel } from "./AlertsDeskPanel";
import { BottomPanel } from "../bottom/BottomPanel";
import { cx } from "../../lib/format";
import { useWorkspace, type BottomWorkspaceTab } from "../../store/workspace";
import { displayCode } from "../../lib/universe";

const TABS: Array<{ id: BottomWorkspaceTab; label: string }> = [
  { id: "options", label: "Option Chain" },
  { id: "orders", label: "Orders" },
  { id: "positions", label: "Positions" },
  { id: "ticket", label: "Order Ticket" },
  { id: "portfolio", label: "Portfolio" },
  { id: "depth", label: "Depth" },
  { id: "journal", label: "Journal" },
  { id: "alerts", label: "Alerts" },
  { id: "analysis", label: "Analysis" },
];

export function DeskBottomWorkspace({
  symbolId,
  timeframe,
  symbolCode,
  height,
}: {
  symbolId: string;
  timeframe: string;
  symbolCode?: string;
  height: number;
}) {
  const tab = useWorkspace((s) => s.bottomTab);
  const setTab = useWorkspace((s) => s.setBottomTab);
  const setOpen = useWorkspace((s) => s.setBottomOpen);

  const optionsUnderlying =
    symbolCode?.toUpperCase().includes("BANK")
      ? "BANKNIFTY"
      : symbolCode?.toUpperCase().includes("SENSEX")
        ? "SENSEX"
        : "NIFTY";

  return (
    <div style={{ height }} className="flex shrink-0 flex-col border-t border-subtle bg-surface">
      <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-subtle/40 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cx(
              "shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              tab === t.id ? "bg-brand/15 text-brand" : "text-faint hover:text-content",
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="btn-chip ml-auto !px-2 !text-[10px]"
          title="Collapse bottom panel"
          onClick={() => setOpen(false)}
        >
          ▾
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "options" && <OptionChainPanel initialUnderlying={optionsUnderlying} compact />}
        {tab === "orders" && <OrdersBlotterPanel />}
        {tab === "positions" && <PositionsPanel />}
        {tab === "ticket" && <OrderTicketPanel symbolCode={displayCode(symbolCode)} />}
        {tab === "portfolio" && <PortfolioPanel />}
        {tab === "depth" && <MarketDepthPanel symbolCode={displayCode(symbolCode)} />}
        {tab === "journal" && <JournalPanel />}
        {tab === "alerts" && <AlertsDeskPanel />}
        {tab === "analysis" && <BottomPanel id={symbolId} tf={timeframe} />}
      </div>
    </div>
  );
}
