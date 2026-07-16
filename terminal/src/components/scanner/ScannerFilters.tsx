import { titleCase } from "../../lib/format";
import { useSettings } from "../../store/settings";
import { Toggle } from "../common/Toggle";

export function ScannerFilters({ setupTypes }: { setupTypes: string[] }) {
  const filters = useSettings((s) => s.scannerFilters);
  const setFilters = useSettings((s) => s.setScannerFilters);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-muted">
        Min confidence
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={filters.minConfidence}
          onChange={(e) => setFilters({ minConfidence: Number(e.target.value) })}
          className="accent-brand"
        />
        <span className="font-mono text-content w-8">{filters.minConfidence}%</span>
      </label>

      <select
        className="input !w-auto py-1.5 text-xs"
        value={filters.setupType}
        onChange={(e) => setFilters({ setupType: e.target.value })}
      >
        <option value="">Any setup</option>
        {setupTypes.map((t) => (
          <option key={t} value={t}>
            {titleCase(t)}
          </option>
        ))}
      </select>

      <select
        className="input !w-auto py-1.5 text-xs"
        value={filters.trend}
        onChange={(e) => setFilters({ trend: e.target.value })}
      >
        <option value="">Any trend</option>
        <option value="bullish">Bullish</option>
        <option value="bearish">Bearish</option>
        <option value="sideways">Sideways</option>
      </select>

      <Toggle
        checked={filters.onlyWithSetups}
        onChange={(v) => setFilters({ onlyWithSetups: v })}
        label="Only with setups"
      />
    </div>
  );
}
