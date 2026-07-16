import type { InspectorData } from "../types";

interface Props {
  data: InspectorData | null;
  loading?: boolean;
}

export function InspectorPanel({ data, loading }: Props) {
  if (loading) return <div className="panel inspector">Loading inspector…</div>;
  if (!data) return <div className="panel inspector">Select a candle to inspect.</div>;

  return (
    <div className="panel inspector">
      <h3>Inspector — Bar {data.bar_index}</h3>
      <p className="muted">{data.open_time}</p>

      <section>
        <h4>Candle</h4>
        <pre>{JSON.stringify(data.candle, null, 2)}</pre>
      </section>

      <section>
        <h4>Indicators</h4>
        <pre>{JSON.stringify(data.indicators, null, 2)}</pre>
      </section>

      <section>
        <h4>Market Structure</h4>
        <pre>{JSON.stringify(data.market_structure, null, 2)}</pre>
      </section>

      <section>
        <h4>Smart Money</h4>
        <pre>{JSON.stringify(data.smart_money, null, 2)}</pre>
      </section>

      {data.trade_setup && (
        <section>
          <h4>Trade Setup</h4>
          <pre>{JSON.stringify(data.trade_setup, null, 2)}</pre>
        </section>
      )}

      {data.strategy_evaluation && (
        <section>
          <h4>Strategy Evaluation</h4>
          <pre>{JSON.stringify(data.strategy_evaluation, null, 2)}</pre>
        </section>
      )}

      {Object.keys(data.evidence_breakdown).length > 0 && (
        <section>
          <h4>Evidence Breakdown</h4>
          <ul className="evidence-list">
            {Object.entries(data.evidence_breakdown).map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <span>{v.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.reasoning && (
        <section>
          <h4>Reasoning</h4>
          <p className="reasoning">{data.reasoning}</p>
        </section>
      )}
    </div>
  );
}
