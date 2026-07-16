import { OVERLAY_OPTIONS, type OverlayKey } from "../types";

interface Props {
  enabled: Set<OverlayKey>;
  onChange: (key: OverlayKey, checked: boolean) => void;
}

export function OverlayToggles({ enabled, onChange }: Props) {
  const groups = [...new Set(OVERLAY_OPTIONS.map((o) => o.group))];

  return (
    <div className="panel overlay-toggles">
      <h3>Overlays</h3>
      {groups.map((group) => (
        <div key={group} className="overlay-group">
          <h4>{group}</h4>
          {OVERLAY_OPTIONS.filter((o) => o.group === group).map((o) => (
            <label key={o.key} className="overlay-label">
              <input
                type="checkbox"
                checked={enabled.has(o.key)}
                onChange={(e) => onChange(o.key, e.target.checked)}
              />
              {o.label}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
