import { useState } from "react";
import { useActiveSetups } from "../../hooks/queries";
import { Tabs, type TabItem } from "../common/Tabs";
import { BacktestSummaryTab } from "./BacktestSummaryTab";
import { EventLogTab } from "./EventLogTab";
import { OpportunitiesTab } from "./OpportunitiesTab";
import { RecentAnalysisTab } from "./RecentAnalysisTab";
import { TradeHistoryTab } from "./TradeHistoryTab";

type TabId = "opportunities" | "recent" | "events" | "trades" | "backtest";

export function BottomPanel({ id, tf }: { id: string; tf: string }) {
  const [tab, setTab] = useState<TabId>("opportunities");
  const setups = useActiveSetups(id, tf);

  const items: TabItem<TabId>[] = [
    { id: "opportunities", label: "Opportunities", badge: setups.data?.items.length },
    { id: "recent", label: "Recent Analysis" },
    { id: "events", label: "Event Log" },
    { id: "trades", label: "Trade History" },
    { id: "backtest", label: "Performance" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 pt-2 border-b border-subtle/60">
        <Tabs items={items} value={tab} onChange={setTab} />
      </div>
      <div className="flex-1 min-h-0">
        {tab === "opportunities" && <OpportunitiesTab id={id} tf={tf} />}
        {tab === "recent" && <RecentAnalysisTab id={id} tf={tf} />}
        {tab === "events" && <EventLogTab id={id} tf={tf} />}
        {tab === "trades" && <TradeHistoryTab id={id} tf={tf} />}
        {tab === "backtest" && <BacktestSummaryTab id={id} tf={tf} />}
      </div>
    </div>
  );
}
