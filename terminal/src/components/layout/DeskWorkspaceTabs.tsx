/**
 * Workspace tabs under market strip — Chart / Option Chain / AI / …
 */

import { cx } from "../../lib/format";
import { useWorkspace, type DeskWorkspace } from "../../store/workspace";

const TABS: Array<{ id: DeskWorkspace; label: string }> = [
  { id: "chart", label: "Chart" },
  { id: "options", label: "Option Chain" },
  { id: "depth", label: "Market Depth" },
  { id: "orders", label: "Orders" },
  { id: "positions", label: "Positions" },
  { id: "ai", label: "AI Analysis" },
  { id: "journal", label: "Journal" },
  { id: "alerts", label: "Alerts" },
];

export function DeskWorkspaceTabs() {
  const deskWorkspace = useWorkspace((s) => s.deskWorkspace);
  const bottomTab = useWorkspace((s) => s.bottomTab);
  const bottomOpen = useWorkspace((s) => s.bottomOpen);
  const rightPanelTab = useWorkspace((s) => s.rightPanelTab);
  const rightPanelOpen = useWorkspace((s) => s.rightPanelOpen);
  const openDesk = useWorkspace((s) => s.openDeskWorkspace);
  const setAnalysisMode = useWorkspace((s) => s.setAnalysisMode);

  const isActive = (id: (typeof TABS)[number]["id"]) => {
    if (id === "chart") return deskWorkspace === "chart" || deskWorkspace === "markets";
    if (id === "options") return bottomOpen && bottomTab === "options";
    if (id === "depth") return bottomOpen && bottomTab === "depth";
    if (id === "orders") return bottomOpen && bottomTab === "orders";
    if (id === "positions") return bottomOpen && bottomTab === "positions";
    if (id === "journal") return bottomOpen && bottomTab === "journal";
    if (id === "alerts") return bottomOpen && bottomTab === "alerts";
    if (id === "ai") return rightPanelOpen && rightPanelTab === "ai";
    return false;
  };

  return (
    <div className="desk-workspace-tabs hidden items-center gap-0 border-b border-subtle bg-surface px-2 lg:flex">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cx("desk-ws-tab", isActive(t.id) && "desk-ws-tab-active")}
          onClick={() => openDesk(t.id as DeskWorkspace)}
        >
          {t.label}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1 py-1">
        <button
          type="button"
          className="btn-chip !text-[10px]"
          title="Focus chart (F)"
          onClick={() => {
            openDesk("chart");
            setAnalysisMode(true);
          }}
        >
          Focus
        </button>
      </div>
    </div>
  );
}
