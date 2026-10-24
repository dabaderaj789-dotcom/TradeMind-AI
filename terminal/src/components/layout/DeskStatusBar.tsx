/**
 * Compact bottom status / information bar.
 * Connection chip ≠ market-data freshness — both are shown separately.
 */

import { useEffect, useState } from "react";
import { ConnectionStatusChip } from "../shell/ConnectionStatus";
import type { Timeframe } from "../../lib/endpoints";
import { formatIstTime } from "../../lib/marketPrice";

export function DeskStatusBar({
  symbolCode,
  timeframe,
  exchangeHint,
  freshnessLabel,
  live,
  dataSource,
  provider,
  quoteUpdatedAt,
  candleOpenAt,
}: {
  symbolCode: string;
  timeframe: Timeframe;
  exchangeHint: string;
  freshnessLabel: string;
  live: boolean;
  dataSource?: string;
  provider?: string | null;
  quoteUpdatedAt?: string | null;
  candleOpenAt?: string | null;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

  return (
    <footer className="desk-status-bar hidden lg:flex">
      <span className={live ? "text-bull" : "text-faint"}>{live ? "● LIVE" : freshnessLabel}</span>
      <span className="opacity-30">|</span>
      <span className="font-semibold uppercase tracking-wide">{exchangeHint}</span>
      <span className="font-mono tabular-nums text-content">{symbolCode}</span>
      <span className="font-mono tabular-nums">{timeframe}</span>
      <span className="opacity-30">|</span>
      <span title={dataSource || undefined}>{provider || dataSource || "Market Data"}</span>
      <span className="opacity-30">|</span>
      <span className="font-mono tabular-nums" title="Last quote (IST)">
        Q {formatIstTime(quoteUpdatedAt)}
      </span>
      <span className="font-mono tabular-nums" title="Last candle open (IST)">
        C {formatIstTime(candleOpenAt)}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <ConnectionStatusChip compact />
        <span className="font-mono tabular-nums">{time} IST</span>
        <span>UTC+5:30</span>
      </div>
    </footer>
  );
}
