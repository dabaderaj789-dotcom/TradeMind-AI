import { useEffect, useState } from "react";
import { api } from "../api";
import type { ValidationDashboard, ValidationReport } from "../validationTypes";

const SETUP_TYPES = [
  "", "trend_continuation", "pullback", "breakout", "reversal", "range_rejection",
];
const STRATEGIES = [
  "", "trend_continuation", "pullback", "breakout", "reversal", "range_rejection",
];

interface Props {
  symbols: Array<{ id: string; code: string }>;
}

export function ValidationDashboardView({ symbols }: Props) {
  const [symbolId, setSymbolId] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [setupType, setSetupType] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dashboard, setDashboard] = useState<ValidationDashboard | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);

  const filters = (): Record<string, string> => {
    const f: Record<string, string> = {};
    if (symbolId) f.symbol_id = symbolId;
    if (timeframe) f.timeframe = timeframe;
    if (strategyId) f.strategy_id = strategyId;
    if (setupType) f.setup_type = setupType;
    if (start) f.start = new Date(start).toISOString();
    if (end) f.end = new Date(end).toISOString();
    return f;
  };

  const load = async () => {
    setLoading(true);
    try {
      const f = filters();
      const [dash, rep] = await Promise.all([
        api.getDashboard(f),
        api.getValidationReport(f),
      ]);
      setDashboard(dash);
      setReport(rep);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const exportCsv = async () => {
    const csv = await api.exportValidationCsv(filters());
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "validation_reviews.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-view">
      <div className="dashboard-filters panel">
        <h3>Validation Dashboard</h3>
        <div className="filter-grid">
          <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
            <option value="">All symbols</option>
            {symbols.map((s) => (
              <option key={s.id} value={s.id}>{s.code}</option>
            ))}
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            <option value="">All timeframes</option>
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
          <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
            <option value="">All strategies</option>
            {STRATEGIES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={setupType} onChange={(e) => setSetupType(e.target.value)}>
            <option value="">All setup types</option>
            {SETUP_TYPES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button type="button" onClick={load} disabled={loading}>Apply</button>
          <button type="button" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {dashboard && (
        <div className="dashboard-stats panel">
          <div className="stat-cards">
            <div className="stat-card">
              <span>Total Reviewed</span>
              <strong>{dashboard.total_reviewed}</strong>
            </div>
            <div className="stat-card accept">
              <span>Acceptance Rate</span>
              <strong>{dashboard.acceptance_rate_pct}%</strong>
            </div>
            <div className="stat-card reject">
              <span>Rejection Rate</span>
              <strong>{dashboard.rejection_rate_pct}%</strong>
            </div>
            <div className="stat-card">
              <span>Unsure</span>
              <strong>{dashboard.unsure_rate_pct}%</strong>
            </div>
          </div>

          <h4>Rejection Reasons</h4>
          {dashboard.rejection_reasons.length === 0 ? (
            <p className="muted">No rejections recorded.</p>
          ) : (
            <ul className="reason-list">
              {dashboard.rejection_reasons.map((r) => (
                <li key={r.reason}>
                  <span>{r.label}</span>
                  <span>{r.count}</span>
                </li>
              ))}
            </ul>
          )}

          <h4>Plugin Statistics</h4>
          <table className="timing-table">
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Flagged</th>
                <th>Incorrect</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(dashboard.plugin_statistics).map(([id, s]) => (
                <tr key={id}>
                  <td>{s.label}</td>
                  <td>{s.flagged_reviews}</td>
                  <td>{s.incorrect_count}</td>
                  <td>{s.incorrect_rate_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report && (
        <div className="dashboard-report panel">
          <h3>Recurring Issues Report</h3>
          <p>{report.summary}</p>
          <ul className="issue-list">
            {report.issues.map((issue) => (
              <li key={`${issue.category}-${issue.key}`} className={`severity-${issue.severity}`}>
                <strong>{issue.label}</strong>
                <span>{issue.count} ({issue.pct_of_incorrect}% of incorrect)</span>
              </li>
            ))}
          </ul>
          <h4>Recommendations</h4>
          <ul>
            {report.recommendations.map((rec) => (
              <li key={rec}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
