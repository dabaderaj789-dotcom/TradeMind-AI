import type { ReplayEvent } from "../types";

const EVENT_COLORS: Record<string, string> = {
  bos: "#2196f3",
  choch: "#ff9800",
  order_block: "#9c27b0",
  fvg: "#00bcd4",
  liquidity_sweep: "#ffeb3b",
  trade_setup: "#4caf50",
  strategy_decision: "#e91e63",
  swing_high: "#ef5350",
  swing_low: "#26a69a",
};

interface Props {
  events: ReplayEvent[];
  currentIndex: number;
  onSelect: (eventId: string) => void;
  filter?: string;
}

export function EventLog({ events, currentIndex, onSelect, filter }: Props) {
  const filtered = filter
    ? events.filter((e) => e.event_type === filter)
    : events;

  return (
    <div className="panel event-log">
      <h3>Event Log ({filtered.length})</h3>
      <div className="event-list">
        {filtered.map((e) => (
          <button
            key={e.event_id}
            type="button"
            className={`event-item ${e.bar_index <= currentIndex ? "visible" : "future"} ${
              e.bar_index === currentIndex ? "current" : ""
            }`}
            onClick={() => onSelect(e.event_id)}
          >
            <span
              className="event-dot"
              style={{ background: EVENT_COLORS[e.event_type] ?? "#888" }}
            />
            <span className="event-type">{e.event_type}</span>
            <span className="event-label">{e.label}</span>
            <span className="event-bar">#{e.bar_index}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
