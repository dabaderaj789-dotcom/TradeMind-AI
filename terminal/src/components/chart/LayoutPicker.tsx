import { LAYOUT_OPTIONS, useWorkspace, type LayoutId } from "../../store/workspace";
import { cx } from "../../lib/format";

export function LayoutPicker({ mobile = false }: { mobile?: boolean }) {
  const layout = useWorkspace((s) => s.layout);
  const setLayout = useWorkspace((s) => s.setLayout);

  if (mobile) return null;

  return (
    <div className="inline-flex items-center gap-0.5">
      {LAYOUT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.label}
          onClick={() => setLayout(opt.id as LayoutId)}
          className={cx(
            "rounded-md px-2 py-1.5 text-[10px] font-semibold tracking-wide transition-all duration-200 ease-terminal",
            layout === opt.id
              ? "bg-elevated text-content shadow-[inset_0_-1px_0_0_rgb(var(--c-brand))]"
              : "text-faint hover:bg-elevated/50 hover:text-muted",
          )}
        >
          {opt.short}
        </button>
      ))}
    </div>
  );
}
