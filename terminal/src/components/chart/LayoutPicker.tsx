import { useEffect, useRef, useState } from "react";
import {
  LAYOUT_OPTIONS,
  LAYOUT_ROWS,
  useWorkspace,
  type LayoutId,
  type LayoutOption,
} from "../../store/workspace";
import { cx } from "../../lib/format";

/** Mini preview matching Angel One / TradingView layout glyphs. */
function LayoutGlyph({
  id,
  active,
  size = "md",
}: {
  id: LayoutId;
  active?: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-6 w-8" : "h-7 w-9";
  const gap = "gap-px";
  const cell = cx(
    "rounded-[1px]",
    active ? "bg-white/95" : "bg-content/80",
  );
  const frame = cx(
    box,
    "grid overflow-hidden rounded border p-0.5 transition-colors",
    active ? "border-brand bg-brand" : "border-content/35 bg-transparent",
  );

  switch (id) {
    case "1":
      return (
        <div className={frame}>
          <div className={cell} />
        </div>
      );
    case "2v":
      return (
        <div className={cx(frame, "grid-cols-2", gap)}>
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "2h":
      return (
        <div className={cx(frame, "grid-rows-2", gap)}>
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "3v":
      return (
        <div className={cx(frame, "grid-cols-3", gap)}>
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "3h":
      return (
        <div className={cx(frame, "grid-rows-3", gap)}>
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "3l":
      return (
        <div className={cx(frame, "grid-cols-2 grid-rows-2", gap)}>
          <div className={cx(cell, "row-span-2")} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "3t":
      return (
        <div className={cx(frame, "grid-cols-2 grid-rows-2", gap)}>
          <div className={cx(cell, "col-span-2")} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "4":
      return (
        <div className={cx(frame, "grid-cols-2 grid-rows-2", gap)}>
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "4v":
      return (
        <div className={cx(frame, "grid-cols-4", gap)}>
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "4h":
      return (
        <div className={cx(frame, "grid-rows-4", gap)}>
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "4l":
      return (
        <div className={cx(frame, "grid-cols-2 grid-rows-3", gap)}>
          <div className={cx(cell, "row-span-3")} />
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "6":
      return (
        <div className={cx(frame, "grid-cols-3 grid-rows-2", gap)}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cell} />
          ))}
        </div>
      );
    case "6h":
      return (
        <div className={cx(frame, "grid-cols-2 grid-rows-3", gap)}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cell} />
          ))}
        </div>
      );
    case "8":
      return (
        <div className={cx(frame, "grid-cols-4 grid-rows-2", gap)}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={cell} />
          ))}
        </div>
      );
    default:
      return <div className={frame} />;
  }
}

function LayoutOptionButton({
  opt,
  active,
  onPick,
}: {
  opt: LayoutOption;
  active: boolean;
  onPick: (id: LayoutId) => void;
}) {
  return (
    <button
      type="button"
      title={opt.label}
      aria-label={opt.label}
      aria-pressed={active}
      onClick={() => onPick(opt.id)}
      className={cx(
        "rounded-md p-1 transition-colors",
        active ? "bg-brand/10" : "hover:bg-elevated",
      )}
    >
      <LayoutGlyph id={opt.id} active={active} />
    </button>
  );
}

export function LayoutPicker({ mobile = false }: { mobile?: boolean }) {
  const layout = useWorkspace((s) => s.layout);
  const setLayout = useWorkspace((s) => s.setLayout);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (mobile) return null;

  const current = LAYOUT_OPTIONS.find((o) => o.id === layout) ?? LAYOUT_OPTIONS[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Select Layout"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "inline-flex items-center justify-center rounded-md border px-1.5 py-1 transition-colors",
          open
            ? "border-brand/40 bg-brand/10"
            : "border-subtle/40 bg-elevated/40 hover:border-subtle hover:bg-elevated",
        )}
      >
        <LayoutGlyph id={current.id} size="sm" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Chart layouts"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-lg border border-subtle/50 bg-surface p-2 shadow-pop animate-fade-in"
        >
          <div className="mb-1.5 flex items-center gap-2 border-b border-subtle/30 px-1 pb-2">
            <LayoutGlyph id={current.id} active size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold tracking-tight text-content">Select layout</div>
              <div className="truncate text-[10px] text-faint">{current.label}</div>
            </div>
          </div>

          <div className="max-h-[min(70vh,420px)] space-y-1 overflow-y-auto pr-0.5">
            {LAYOUT_ROWS.map((row) => (
              <div
                key={row.count}
                className="flex items-center gap-1.5 border-b border-subtle/20 py-1.5 last:border-0"
              >
                <div className="w-4 shrink-0 text-center font-mono text-[11px] font-bold text-faint">
                  {row.count}
                </div>
                <div className="flex flex-wrap items-center gap-0.5">
                  {row.options.map((opt) => (
                    <LayoutOptionButton
                      key={opt.id}
                      opt={opt}
                      active={layout === opt.id}
                      onPick={(id) => {
                        setLayout(id);
                        setOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
