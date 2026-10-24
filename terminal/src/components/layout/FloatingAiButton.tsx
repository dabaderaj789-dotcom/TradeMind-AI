import { cx } from "../../lib/format";
import { useWorkspace } from "../../store/workspace";

/** Floating AI control — solid desk chip, not a glowing marketing FAB. */
export function FloatingAiButton({ decisionKind }: { decisionKind?: string | null }) {
  const rightOpen = useWorkspace((s) => s.rightPanelOpen);
  const rightTab = useWorkspace((s) => s.rightPanelTab);
  const analysisMode = useWorkspace((s) => s.analysisMode);
  const openRight = useWorkspace((s) => s.openRightPanel);
  const setAiPanelMode = useWorkspace((s) => s.setAiPanelMode);

  const aiVisible = rightOpen && rightTab === "ai";
  if (aiVisible && !analysisMode) return null;

  const tone =
    decisionKind?.includes("BUY")
      ? "border-bull/40 bg-bull text-white"
      : decisionKind?.includes("SELL")
        ? "border-bear/40 bg-bear text-white"
        : "border-brand/30 bg-brand text-white";

  return (
    <button
      type="button"
      title="Open AI analysis"
      onClick={() => {
        if (analysisMode) setAiPanelMode("strip");
        else openRight("ai");
      }}
      className={cx(
        "fixed z-50 flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] font-semibold shadow-card",
        "transition-colors hover:brightness-105 active:scale-[0.98]",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 lg:bottom-5 lg:right-14",
        tone,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
      </svg>
      <span>AI Desk</span>
      {decisionKind && (
        <span className="rounded bg-black/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide">
          {decisionKind}
        </span>
      )}
    </button>
  );
}
