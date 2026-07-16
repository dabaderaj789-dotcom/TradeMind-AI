import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { TopBarActions } from "../components/layout/TopBarActions";
import { Badge, Skeleton } from "../components/common/primitives";
import { useMorningBrief, type OutlookBias } from "../hooks/useMorningBrief";
import { useCalendarEvents } from "../hooks/queries";
import { useSelectSymbol } from "../hooks/useSelectSymbol";
import {
  formatCountdown,
  greetingForNow,
  isIndiaSessionOpen,
  nextIndiaOpen,
} from "../lib/briefing";
import { cx } from "../lib/format";
import { useAuth } from "../store/auth";
import { usePrefs } from "../store/prefs";
import { useSettings } from "../store/settings";

const BIAS_TONE: Record<OutlookBias, "bull" | "bear" | "neutral"> = {
  Bullish: "bull",
  Bearish: "bear",
  Neutral: "neutral",
};

export function HomePage() {
  const user = useAuth((s) => s.user);
  const defaultTf = useSettings((s) => s.defaultTimeframe);
  const recents = usePrefs((s) => s.recents);
  const watchlist = usePrefs((s) => s.watchlist);
  const select = useSelectSymbol();
  const { outlook, opportunities, isLoading } = useMorningBrief(defaultTf);
  const calendar = useCalendarEvents();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const open = isIndiaSessionOpen(now);
  const target = nextIndiaOpen(now);
  const countdown = formatCountdown(target.getTime() - now.getTime());
  const greeting = greetingForNow(now);
  const news = useMemo(
    () =>
      (calendar.data?.items ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        market: e.market,
        timeLabel: e.time_label,
        impact: e.impact as "high" | "medium",
      })),
    [calendar.data],
  );

  const terminalTarget =
    recents[0] ?? watchlist[0] ?? (opportunities[0] ? { id: opportunities[0].id, symbol_code: opportunities[0].code, name: opportunities[0].name, exchange_code: "" } : null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-subtle/60 bg-surface/90 px-4 backdrop-blur-md lg:px-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
          TradeMind · Daily Brief
        </div>
        <TopBarActions />
      </header>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-lg px-5 py-8 pb-28 lg:max-w-xl lg:py-12 lg:pb-12">
          {/* Hero greeting */}
          <section className="animate-fade-in text-center">
            <h1 className="font-display text-[2rem] font-semibold tracking-tight text-content sm:text-4xl">
              {greeting}
            </h1>
            {user?.displayName && (
              <p className="mt-1.5 text-sm text-muted">{user.displayName}</p>
            )}
          </section>

          {/* Markets open countdown */}
          <section className="mt-10 animate-fade-in text-center" style={{ animationDelay: "40ms" }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
              {open ? "Markets Open" : "Markets Open In"}
            </div>
            <div
              className={cx(
                "mt-3 font-mono text-4xl font-semibold tabular-nums tracking-wider sm:text-5xl",
                open ? "text-bull" : "text-content",
              )}
              aria-live="polite"
            >
              {open ? "LIVE" : countdown}
            </div>
            <p className="mt-2 text-[11px] text-faint">India cash session · NSE 09:15 IST</p>
          </section>

          <Divider />

          {/* Today's Outlook */}
          <section className="animate-fade-in" style={{ animationDelay: "80ms" }}>
            <SectionTitle>Today&apos;s Outlook</SectionTitle>
            <div className="mt-5 space-y-3">
              {isLoading && outlook.every((o) => o.bias === "Neutral")
                ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)
                : outlook.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-subtle/50 bg-surface/80 px-4 py-3.5"
                    >
                      <span className="text-sm font-medium text-content">{row.label}</span>
                      <Badge tone={BIAS_TONE[row.bias]}>{row.bias}</Badge>
                    </div>
                  ))}
            </div>
          </section>

          <Divider />

          {/* Top opportunities */}
          <section className="animate-fade-in" style={{ animationDelay: "120ms" }}>
            <SectionTitle>Top 5 Opportunities</SectionTitle>
            <ol className="mt-5 space-y-2">
              {isLoading && opportunities.length === 0
                ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)
                : opportunities.map((op, idx) => (
                    <li key={op.id}>
                      <button
                        type="button"
                        onClick={() =>
                          select({
                            id: op.id,
                            symbol_code: op.code,
                            name: op.name,
                            exchange_code: "",
                          })
                        }
                        className="flex w-full items-center gap-3 rounded-xl border border-subtle/50 bg-surface/80 px-4 py-3.5 text-left transition-colors hover:border-brand/40 hover:bg-elevated/80 active:scale-[0.99]"
                      >
                        <span className="w-5 shrink-0 font-mono text-xs text-faint">{idx + 1}.</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-content">
                          {op.code}
                        </span>
                        <Badge tone={op.tone}>{op.kind}</Badge>
                        {op.confidence != null ? (
                          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                            {op.confidence}%
                          </span>
                        ) : (
                          <span className="w-10 shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
              {!isLoading && opportunities.length === 0 && (
                <p className="rounded-xl border border-subtle/50 bg-surface/60 px-4 py-6 text-center text-sm text-muted">
                  No qualified setups yet — TradeMind stays in WAIT until evidence clears.
                </p>
              )}
            </ol>
          </section>

          <Divider />

          {/* News */}
          <section className="animate-fade-in" style={{ animationDelay: "160ms" }}>
            <SectionTitle>High Impact News</SectionTitle>
            <div className="mt-5 rounded-xl border border-subtle/50 bg-surface/80 px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-content">{news.length} Events Today</span>
                <span className="text-[10px] uppercase tracking-wide text-faint">Economic calendar</span>
              </div>
              <ul className="mt-3 space-y-2.5">
                {news.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 text-[12px]">
                    <div className="min-w-0">
                      <div className="font-medium text-content">{e.title}</div>
                      <div className="text-faint">{e.market}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-muted">{e.timeLabel}</div>
                      <Badge tone="warn">{e.impact}</Badge>
                    </div>
                  </li>
                ))}
                {!calendar.isLoading && news.length === 0 && (
                  <li className="text-sm text-muted">No calendar events from the API for today.</li>
                )}
              </ul>
            </div>
          </section>

          <Divider />

          {/* CTA */}
          <div className="animate-fade-in pt-2" style={{ animationDelay: "200ms" }}>
            {terminalTarget ? (
              <button
                type="button"
                className="btn-primary w-full min-h-[52px] text-base font-semibold tracking-tight shadow-pop"
                onClick={() => select(terminalTarget)}
              >
                Open Trading Terminal
              </button>
            ) : (
              <Link to="/markets" className="btn-primary flex min-h-[52px] w-full items-center justify-center text-base font-semibold tracking-tight shadow-pop">
                Open Trading Terminal
              </Link>
            )}
            <div className="mt-3 flex justify-center gap-4 text-xs">
              <Link to="/scanner" className="text-muted underline-offset-2 hover:text-brand hover:underline">
                Scanner
              </Link>
              <Link to="/markets" className="text-muted underline-offset-2 hover:text-brand hover:underline">
                Markets
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-faint">
      {children}
    </h2>
  );
}

function Divider() {
  return (
    <div
      className="my-9 flex justify-center"
      aria-hidden
    >
      <div className="h-px w-40 bg-gradient-to-r from-transparent via-subtle to-transparent" />
    </div>
  );
}
