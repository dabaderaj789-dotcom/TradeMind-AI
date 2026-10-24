import { useEffect, useRef, useState } from "react";
import { OVERLAYS, type OverlayId } from "../../lib/overlays";
import { useSettings } from "../../store/settings";
import { Toggle } from "../common/Toggle";
import { cx } from "../../lib/format";

interface Props {
  overlays?: Record<OverlayId, boolean>;
  onChange?: (id: OverlayId, on: boolean) => void;
}

const GROUPS = ["Indicators", "Levels", "Smart Money", "Structure", "Signals"] as const;

export function OverlayToggles({ overlays: overlaysProp, onChange }: Props) {
  const globalOverlays = useSettings((s) => s.overlays);
  const setOverlay = useSettings((s) => s.setOverlay);
  const overlays = overlaysProp ?? globalOverlays;
  const apply = onChange ?? setOverlay;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const activeCount = OVERLAYS.filter((o) => overlays[o.id]).length;
  const needle = q.trim().toLowerCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cx("btn-chip !px-2", open && "btn-chip-active")}
        onClick={() => setOpen((o) => !o)}
        title="Indicators"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="hidden sm:inline">Indicators</span>
        <span className="font-mono text-[10px] text-brand">{activeCount}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 max-h-[min(70vh,520px)] w-80 space-y-2.5 overflow-y-auto rounded-md border border-subtle bg-surface p-2.5 shadow-pop animate-scale-in">
          <input
            className="w-full rounded border border-subtle bg-elevated px-2 py-1.5 text-[11px]"
            placeholder="Search indicators…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {GROUPS.map((g) => {
            const items = OVERLAYS.filter(
              (o) => o.group === g && (!needle || o.label.toLowerCase().includes(needle)),
            );
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-faint">{g}</div>
                <div className="space-y-1.5">
                  {items.map((o) => (
                    <Toggle
                      key={o.id}
                      checked={!!overlays[o.id]}
                      onChange={(v) => apply(o.id, v)}
                      label={o.label}
                      dotColor={o.color}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {!OVERLAYS.some((o) => !needle || o.label.toLowerCase().includes(needle)) && (
            <p className="px-1 py-3 text-center text-[11px] text-faint">No matching indicators</p>
          )}
        </div>
      )}
    </div>
  );
}
