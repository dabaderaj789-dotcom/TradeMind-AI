import { useEffect, useRef, useState } from "react";
import { OVERLAYS, type OverlayId } from "../../lib/overlays";
import { useSettings } from "../../store/settings";
import { Toggle } from "../common/Toggle";

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
      <button type="button" className="btn-chip !px-2" onClick={() => setOpen((o) => !o)} title="Overlays">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18M3 12h18" />
        </svg>
        <span className="hidden sm:inline">Overlays</span>
        <span className="rounded bg-brand/15 text-brand px-1.5 text-[10px] font-semibold">{activeCount}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 space-y-3 rounded-xl border border-subtle/50 bg-surface p-3 shadow-pop animate-fade-in">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{g}</div>
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
