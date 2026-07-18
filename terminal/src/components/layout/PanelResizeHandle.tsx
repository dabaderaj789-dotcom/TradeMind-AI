import { useCallback, useRef } from "react";
import { cx } from "../../lib/format";

/** Drag handle between resizable panels. */
export function PanelResizeHandle({
  onDrag,
  direction = "horizontal",
}: {
  onDrag: (deltaPx: number) => void;
  direction?: "horizontal" | "vertical";
}) {
  const last = useRef(0);
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      last.current = direction === "horizontal" ? e.clientX : e.clientY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [direction],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const cur = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = cur - last.current;
      last.current = cur;
      if (delta !== 0) onDrag(delta);
    },
    [direction, onDrag],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cx(
        "group relative shrink-0 bg-transparent transition-colors",
        direction === "horizontal"
          ? "w-1 cursor-col-resize hover:bg-brand/40 active:bg-brand/60"
          : "h-1 cursor-row-resize hover:bg-brand/40 active:bg-brand/60",
      )}
    >
      <div
        className={cx(
          "absolute rounded-full bg-subtle/0 transition-colors group-hover:bg-brand/50",
          direction === "horizontal"
            ? "left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2"
            : "left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2",
        )}
      />
    </div>
  );
}
