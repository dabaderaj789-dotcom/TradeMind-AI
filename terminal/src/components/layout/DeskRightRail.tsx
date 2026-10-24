import type { ReactNode } from "react";
import { cx } from "../../lib/format";
import { useWorkspace } from "../../store/workspace";

/** Right desk rail — Markets / AI / Analysis (TradeMind labels). */
export function DeskRightRail() {
  const watchlistOpen = useWorkspace((s) => s.watchlistOpen);
  const toggleWatchlist = useWorkspace((s) => s.toggleWatchlist);
  const aiPanelMode = useWorkspace((s) => s.aiPanelMode);
  const setAiPanelMode = useWorkspace((s) => s.setAiPanelMode);
  const analysisMode = useWorkspace((s) => s.analysisMode);
  const setAnalysisMode = useWorkspace((s) => s.setAnalysisMode);

  return (
    <aside
      className="desk-right-rail hidden h-full w-[64px] shrink-0 flex-col items-center border-l border-subtle bg-surface py-2 lg:flex"
      aria-label="Desk panels"
    >
      <RailItem
        label="Markets"
        active={watchlistOpen}
        onClick={toggleWatchlist}
        icon={<IconList />}
      />
      <RailItem
        label="AI Desk"
        active={aiPanelMode === "full" || aiPanelMode === "strip"}
        onClick={() =>
          setAiPanelMode(aiPanelMode === "hidden" ? "full" : aiPanelMode === "full" ? "strip" : "full")
        }
        icon={<IconAi />}
      />
      <RailItem
        label="Focus"
        active={analysisMode}
        onClick={() => setAnalysisMode(!analysisMode)}
        icon={<IconFocus />}
      />
    </aside>
  );
}

function RailItem({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full flex-col items-center gap-1 px-1 py-2.5 transition-colors",
        active ? "bg-brand/12 text-brand" : "text-content hover:bg-elevated",
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center">{icon}</span>
      <span className="text-[9px] font-bold uppercase tracking-[0.06em]">{label}</span>
    </button>
  );
}

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}
function IconAi() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z" />
    </svg>
  );
}
function IconFocus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}
