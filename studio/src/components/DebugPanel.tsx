import type { DebugData, MetricsData } from "../types";

interface Props {
  debug: DebugData | null;
  metrics: MetricsData | null;
  debugMode: boolean;
  onToggleDebug: (enabled: boolean) => void;
}

export function DebugPanel({ debug, metrics, debugMode, onToggleDebug }: Props) {
  return (
    <div className="panel debug-panel">
      <div className="debug-header">
        <h3>Debug & Metrics</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => onToggleDebug(e.target.checked)}
          />
          Debug Mode
        </label>
      </div>

      {metrics && (
        <section>
          <h4>Performance</h4>
          <div className="metrics-grid">
            <div><span>Candles</span><strong>{metrics.metrics.candles_loaded}</strong></div>
            <div><span>Plugins</span><strong>{metrics.metrics.plugins_loaded}</strong></div>
            <div><span>Events</span><strong>{metrics.metrics.events_extracted}</strong></div>
            <div><span>Load</span><strong>{metrics.metrics.total_load_ms.toFixed(0)} ms</strong></div>
            <div><span>DB</span><strong>{metrics.metrics.db_query_ms.toFixed(0)} ms</strong></div>
            <div><span>Memory</span><strong>{(metrics.metrics.memory_estimate_bytes / 1024).toFixed(0)} KB</strong></div>
            <div><span>Cache hits</span><strong>{metrics.metrics.cache_hits}</strong></div>
            <div><span>Tick</span><strong>{metrics.tick_interval_ms} ms</strong></div>
          </div>
          {metrics.metrics.plugin_timings.length > 0 && (
            <table className="timing-table">
              <thead>
                <tr><th>Plugin</th><th>ms</th><th>Rows</th></tr>
              </thead>
              <tbody>
                {metrics.metrics.plugin_timings.map((t) => (
                  <tr key={t.plugin_id}>
                    <td>{t.plugin_id}</td>
                    <td>{t.duration_ms.toFixed(1)}</td>
                    <td>{t.rows_loaded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {debugMode && debug && (
        <>
          <section>
            <h4>Execution Order</h4>
            <ol>{debug.execution_order.map((p) => <li key={p}>{p}</li>)}</ol>
          </section>
          <section>
            <h4>Raw Plugin Outputs</h4>
            <pre className="debug-json">{JSON.stringify(debug.raw_plugin_outputs, null, 2)}</pre>
          </section>
        </>
      )}
    </div>
  );
}
