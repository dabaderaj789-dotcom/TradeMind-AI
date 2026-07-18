import { cx } from "../../lib/format";
import { useWorkspace } from "../../store/workspace";

/** Floating AI FAB — opens the analysis desk when the panel is collapsed. */
export function FloatingAiButton({ decisionKind }: { decisionKind?: string | null }) {
  const open = useWorkspace((s) => s.aiPanelOpen);
  const analysisFs = useWorkspace((s) => s.analysisFullscreen);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);

  if (open || analysisFs) return null;

  const tone =
    decisionKind?.includes("BUY")
      ? "from-bull/90 to-brand/80"
      : decisionKind?.includes("SELL")
        ? "from-bear/90 to-brand/70"
        : "from-brand to-info/80";

  return (
    <button
      type="button"
      title="Open AI analysis"
      onClick={() => setAiPanelOpen(true)}
      className={cx(
        "fixed z-50 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-bg shadow-pop",
        "animate-scale-in transition-transform duration-200 ease-terminal hover:scale-105 active:scale-95",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 lg:bottom-6 lg:right-6",
        `bg-gradient-to-br ${tone}`,
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
      </svg>
      <span>AI Desk</span>
      {decisionKind && (
        <span className="rounded-full bg-bg/20 px-2 py-0.5 text-[10px] font-bold tracking-wide">
          {decisionKind}
        </span>
      )}
    </button>
  );
}
