import { useEffect, useRef, useState } from "react";
import { OVERLAYS, type OverlayId } from "../../lib/overlays";
import { useSettings } from "../../store/settings";
import { Toggle } from "../common/Toggle";

export function OverlayToggles() {
  const overlays = useSettings((s) => s.overlays);
  const setOverlay = useSettings((s) => s.setOverlay);
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
      <button className="btn-chip" onClick={() => setOpen((o) => !o)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18M3 12h18" />
        </svg>
        Overlays
        <span className="rounded bg-brand/15 text-brand px-1.5 text-[10px] font-semibold">{activeCount}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 card shadow-pop p-3 z-40 animate-fade-in space-y-3">
          {groups.map((g) => (
            <div key={g}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-2">{g}</div>
              <div className="space-y-2">
                {OVERLAYS.filter((o) => o.group === g).map((o) => (
                  <Toggle
                    key={o.id}
                    checked={overlays[o.id as OverlayId]}
                    onChange={(v) => setOverlay(o.id as OverlayId, v)}
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
