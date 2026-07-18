import { Link } from "react-router-dom";
import { TopBarActions } from "../components/layout/TopBarActions";
import { Spinner } from "../components/common/primitives";
import { useUniverseSymbols } from "../hooks/useUniverseSymbols";
import { useSelectSymbol } from "../hooks/useSelectSymbol";
import { UniverseQuoteRow } from "../components/markets/UniverseQuoteRow";
import { useAuth } from "../store/auth";
import { greetingForNow, isIndiaSessionOpen } from "../lib/briefing";
import { useEffect, useState } from "react";
import { cx } from "../lib/format";

/** Mobile + desktop Dashboard — four instruments, session status, open chart. */
export function HomePage() {
  const user = useAuth((s) => s.user);
  const { items, ready, isLoading } = useUniverseSymbols();
  const select = useSelectSymbol();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const indiaOpen = isIndiaSessionOpen(now);
  const greeting = greetingForNow(now);
  const first = ready[0]?.lite;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-subtle/40 bg-surface/90 px-4 lg:px-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Dashboard</div>
          <div className="font-display text-sm font-semibold text-content">{greeting}</div>
        </div>
        <TopBarActions />
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-5 pb-24 lg:mx-auto lg:max-w-xl lg:px-0 lg:pb-8">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-subtle/40 bg-surface/80 px-4 py-3">
          <div>
            <div className="text-[11px] text-faint">India session</div>
            <div className={cx("text-sm font-semibold", indiaOpen ? "text-bull" : "text-muted")}>
              {indiaOpen ? "OPEN" : "CLOSED"}
            </div>
          </div>
          {user && <div className="text-xs text-faint">{user.displayName}</div>}
        </div>

        <div className="mb-2 flex items-center justify-between px-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Your markets</h2>
          <Link to="/markets" className="text-[11px] font-medium text-brand">
            View all
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-subtle/40 bg-surface/80">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner label="Loading…" />
            </div>
          ) : (
            <ul className="divide-y divide-subtle/30">
              {items.map((u) => (
                <li key={u.code}>
                  <UniverseQuoteRow
                    item={u}
                    onOpen={() => {
                      if (u.lite) select(u.lite);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {first && (
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            onClick={() => select(first)}
          >
            Open chart
          </button>
        )}
      </div>
    </div>
  );
}
