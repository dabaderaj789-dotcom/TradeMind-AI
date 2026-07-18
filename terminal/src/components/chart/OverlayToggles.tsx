import { useEffect, useRef, useState } from "react";
import { OVERLAYS, type OverlayId } from "../../lib/overlays";
import { useSettings } from "../../store/settings";
import { Toggle } from "../common/Toggle";
import { cx } from "../../lib/format";

interface Props {
  overlays?: Record<OverlayId, boolean>;
  onChange?: (id: OverlayId, on: boolean) => void;
}

export function OverlayToggles({ overlays: overlaysProp, onChange }: Props) {
  const globalOverlays = useSettings((s) => s.overlays);
  const setOverlay = useSettings((s) => s.setOverlay);
  const overlays = overlaysProp ?? globalOverlays;
  const apply = onChange ?? setOverlay;

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const activeCount = Object.values(overlays).filter(Boolean).length;
  const groups = ["Indicators", "Reference", "Smart Money", "Structure"] as const;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cx("btn-chip !px-2", open && "btn-chip-active")}
        onClick={() => setOpen((o) => !o)}
        title="Overlays"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="hidden sm:inline">Overlays</span>
        <span className="font-mono text-[10px] text-brand">{activeCount}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 space-y-3 rounded-xl border border-subtle/40 bg-surface/95 p-3.5 shadow-pop backdrop-blur-xl animate-scale-in">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{g}</div>
              <div className="space-y-2">
                {OVERLAYS.filter((o) => o.group === g).map((o) => (
                  <Toggle
                    key={o.id}
                    checked={overlays[o.id as OverlayId]}
                    onChange={(v) => apply(o.id as OverlayId, v)}
                    label={o.label}
                    dotColor={o.color}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
