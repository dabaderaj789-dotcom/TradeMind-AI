import { LAYOUT_OPTIONS, useWorkspace, type LayoutId } from "../../store/workspace";
import { cx } from "../../lib/format";

export function LayoutPicker({ mobile = false }: { mobile?: boolean }) {
  const layout = useWorkspace((s) => s.layout);
  const setLayout = useWorkspace((s) => s.setLayout);

  if (mobile) {
    // Mobile: single chart only
    return null;
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-subtle/40 bg-elevated/80 p-0.5">
      {LAYOUT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.label}
          onClick={() => setLayout(opt.id as LayoutId)}
          className={cx(
            "px-2 py-1 text-[10px] font-semibold rounded transition-colors",
            layout === opt.id ? "bg-brand text-white" : "text-muted hover:text-content",
          )}
        >
          {opt.short}
        </button>
      ))}
    </div>
  );
}
