/**
 * Trade journal panel — reads AI journal entries (local persist).
 */

import { useAiJournal } from "../../lib/aiJournal";
import { cx, fmtPrice } from "../../lib/format";

export function JournalPanel() {
  const entries = useAiJournal((s) => s.entries);
  const recent = entries.slice(0, 40);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-subtle/40 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-faint">Trade journal</div>
        <p className="text-[11px] text-muted">{entries.length} recorded signals</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!recent.length && (
          <p className="px-3 py-8 text-center text-xs text-muted">
            Signals you take will appear here for review.
          </p>
        )}
        <ul className="divide-y divide-subtle/30">
          {recent.map((e) => (
            <li key={e.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-content">{e.symbolCode}</span>
                <span
                  className={cx(
                    "text-[10px] font-bold uppercase",
                    e.direction === "buy" ? "text-bull" : e.direction === "sell" ? "text-bear" : "text-warn",
                  )}
                >
                  {e.decision}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 font-mono text-[10px] text-faint">
                <span>{e.timeframe}</span>
                <span>{Math.round(e.confidence)}%</span>
                {e.entry != null && <span>@ {fmtPrice(e.entry)}</span>}
                <span className="uppercase">{e.outcome}</span>
              </div>
              {e.reason && <p className="mt-1 line-clamp-2 text-[10px] text-muted">{e.reason}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
