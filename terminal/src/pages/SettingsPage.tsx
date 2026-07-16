import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { TopBarActions } from "../components/layout/TopBarActions";
import { Card } from "../components/common/primitives";
import { Toggle } from "../components/common/Toggle";
import { cx } from "../lib/format";
import { OVERLAYS, type OverlayId } from "../lib/overlays";
import { useSettings, type ThemeMode } from "../store/settings";

const REFRESH_OPTIONS: { label: string; ms: number }[] = [
  { label: "Off", ms: 0 },
  { label: "15s", ms: 15_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
];

export function SettingsPage() {
  const s = useSettings();

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center justify-between px-4 lg:px-6 h-14 border-b border-subtle/60 bg-surface">
        <h1 className="text-base font-semibold text-content">Settings</h1>
        <TopBarActions />
      </header>

      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card title="General">
            <div className="space-y-5">
              <Row label="Default timeframe" hint="Applied when opening the scanner or a symbol.">
                <TimeframeSelector value={s.defaultTimeframe} onChange={s.setDefaultTimeframe} />
              </Row>
              <Row label="Theme" hint="Switch between the dark and light appearance.">
                <div className="inline-flex rounded-lg border border-subtle/70 bg-elevated p-0.5">
                  {(["dark", "light"] as ThemeMode[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => s.setTheme(t)}
                      className={cx(
                        "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                        s.theme === t ? "bg-brand text-white" : "text-muted hover:text-content",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Auto-refresh" hint="Background re-fetch interval. Chart pages also stream ticks with Live / Connecting / Disconnected status.">
                <div className="inline-flex rounded-lg border border-subtle/70 bg-elevated p-0.5">
                  {REFRESH_OPTIONS.map((o) => (
                    <button
                      key={o.ms}
                      onClick={() => s.setRefreshInterval(o.ms)}
                      className={cx(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                        s.refreshInterval === o.ms ? "bg-brand text-white" : "text-muted hover:text-content",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row
                label="Historical overlays"
                hint="Off by default — chart shows only the current OB, fresh FVG, BOS/CHoCH, and trade plan."
              >
                <Toggle checked={s.showHistoricalOverlays} onChange={s.setShowHistoricalOverlays} label={s.showHistoricalOverlays ? "Shown" : "Hidden"} />
              </Row>
              <Row
                label="OHLC compare mode"
                hint="Developer: compare our candles to the live provider reference (Binance / Yahoo — TradingView-equivalent public feeds)."
              >
                <Toggle checked={s.tvCompareMode} onChange={s.setTvCompareMode} label={s.tvCompareMode ? "On" : "Off"} />
              </Row>
            </div>
          </Card>

          <Card title="Default overlays" subtitle="Overlays enabled by default on every chart.">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {OVERLAYS.map((o) => (
                <Toggle
                  key={o.id}
                  checked={s.overlays[o.id as OverlayId]}
                  onChange={(v) => s.setOverlay(o.id as OverlayId, v)}
                  label={o.label}
                  dotColor={o.color}
                />
              ))}
            </div>
          </Card>

          <Card title="Scanner filters" subtitle="Default filters applied on the market scanner.">
            <div className="space-y-4">
              <Row label="Minimum confidence">
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={0} max={100} step={5}
                    value={s.scannerFilters.minConfidence}
                    onChange={(e) => s.setScannerFilters({ minConfidence: Number(e.target.value) })}
                    className="accent-brand"
                  />
                  <span className="font-mono text-content w-10">{s.scannerFilters.minConfidence}%</span>
                </div>
              </Row>
              <Row label="Only symbols with setups">
                <Toggle
                  checked={s.scannerFilters.onlyWithSetups}
                  onChange={(v) => s.setScannerFilters({ onlyWithSetups: v })}
                />
              </Row>
            </div>
          </Card>

          <div className="flex justify-end">
            <button className="btn-ghost" onClick={s.reset}>Reset to defaults</button>
          </div>

          <p className="text-xs text-faint text-center pt-2">
            All settings are saved locally in your browser.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-content">{label}</div>
        {hint && <div className="text-xs text-faint mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
