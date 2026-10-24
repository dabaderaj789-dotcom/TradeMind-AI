/**
 * Option chain panel — real NSE poll; LIVE/STALE; Unavailable never coerced to 0.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiGet, qs } from "../../lib/apiClient";
import { cx, fmtPrice } from "../../lib/format";
import { useOptionChainFreeze } from "../../lib/optionChainFreeze";
import { SENSEX_OPTION_CHAIN_STATUS } from "../../lib/sensexOptionChain";

interface Leg {
  strike: number;
  option_type: "CE" | "PE";
  bid: number | null;
  ask: number | null;
  ltp: number | null;
  volume: number | null;
  oi: number | null;
  oi_change: number | null;
  iv: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
}

interface Row {
  strike: number;
  moneyness: "ITM" | "ATM" | "OTM";
  call: Leg;
  put: Leg;
}

interface Chain {
  underlying: string;
  spot: number | null;
  futures: number | null;
  atm_strike: number | null;
  expiry: string | null;
  expiries: string[];
  rows: Row[];
  as_of: string;
  source: string;
  reference_note: string;
}

/** Underlyings the current NSE provider actually serves. */
const UNDERLYINGS = ["NIFTY", "BANKNIFTY"] as const;
const STALE_MS = 8_000;

function feedState(asOf: string | undefined, isError: boolean, isFetching: boolean, hasData: boolean) {
  if (isError) return { label: "DISCONNECTED", tone: "text-bear" as const };
  if (!hasData && isFetching) return { label: "LOADING", tone: "text-faint" as const };
  if (!asOf) return { label: "UNAVAILABLE", tone: "text-faint" as const };
  const age = Date.now() - new Date(asOf).getTime();
  if (!Number.isFinite(age) || age < 0) return { label: "UNAVAILABLE", tone: "text-faint" as const };
  if (age <= STALE_MS) return { label: "LIVE", tone: "text-bull" as const };
  if (age <= 60_000) return { label: "STALE", tone: "text-warn" as const };
  return { label: "STALE", tone: "text-bear" as const };
}

export function OptionChainPanel({
  initialUnderlying,
  compact = false,
}: {
  initialUnderlying?: string;
  compact?: boolean;
}) {
  const seed = (UNDERLYINGS as readonly string[]).includes((initialUnderlying ?? "").toUpperCase())
    ? (initialUnderlying!.toUpperCase() as (typeof UNDERLYINGS)[number])
    : "NIFTY";
  const [underlying, setUnderlying] = useState<(typeof UNDERLYINGS)[number]>(seed);
  const [expiry, setExpiry] = useState<string>("");
  const [strikeBand, setStrikeBand] = useState(0.03);

  useEffect(() => {
    const u = (initialUnderlying ?? "").toUpperCase();
    if ((UNDERLYINGS as readonly string[]).includes(u)) {
      setUnderlying(u as (typeof UNDERLYINGS)[number]);
      setExpiry("");
    }
  }, [initialUnderlying]);

  const q = useQuery({
    queryKey: ["option-chain", underlying, expiry],
    queryFn: ({ signal }) =>
      apiGet<Chain>(
        `/market-engine/option-chain/${underlying}${qs({ expiry: expiry || undefined })}`,
        signal,
      ),
    refetchInterval: 3_000,
    retry: 1,
  });

  const chain = q.data;
  useEffect(() => {
    if (chain?.expiry && !expiry) setExpiry(chain.expiry);
  }, [chain?.expiry, expiry]);

  const feed = feedState(chain?.as_of, q.isError, q.isFetching, !!chain);
  const publishOc = useOptionChainFreeze((s) => s.publish);

  useEffect(() => {
    if (!chain?.rows?.length) return;
    const atm = chain.atm_strike;
    const atmRow =
      atm != null
        ? chain.rows.find((r) => r.strike === atm) ??
          chain.rows[Math.floor(chain.rows.length / 2)]
        : null;
    const feedLabel =
      feed.label === "LIVE" ||
      feed.label === "STALE" ||
      feed.label === "DISCONNECTED" ||
      feed.label === "UNAVAILABLE"
        ? feed.label
        : "UNAVAILABLE";
    publishOc({
      asOf: chain.as_of ?? null,
      underlying,
      expiry: (chain.expiry ?? expiry) || null,
      atmStrike: atm ?? null,
      spot: chain.spot ?? null,
      feedState: feedLabel,
      atmCallLtp: atmRow?.call?.ltp ?? null,
      atmPutLtp: atmRow?.put?.ltp ?? null,
      atmCallOi: atmRow?.call?.oi ?? null,
      atmPutOi: atmRow?.put?.oi ?? null,
      atmCallOiChange: atmRow?.call?.oi_change ?? null,
      atmPutOiChange: atmRow?.put?.oi_change ?? null,
      atmCallIv: atmRow?.call?.iv ?? null,
      atmPutIv: atmRow?.put?.iv ?? null,
      source: chain.source ?? "market-engine",
    });
  }, [chain, underlying, expiry, feed.label, publishOc]);

  const nearAtm = useMemo(() => {
    if (!chain?.rows?.length || chain.atm_strike == null) return chain?.rows ?? [];
    const atm = chain.atm_strike;
    return chain.rows.filter((r) => Math.abs(r.strike - atm) <= atm * strikeBand);
  }, [chain, strikeBand]);

  const sensexBlocked = (initialUnderlying ?? "").toUpperCase().includes("SENSEX");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cx("flex flex-wrap items-center gap-1.5 border-b border-subtle/40", compact ? "px-2 py-1.5" : "px-3 py-2")}>
        {UNDERLYINGS.map((u) => (
          <button
            key={u}
            type="button"
            className={cx("btn-chip !px-2 !text-[10px]", underlying === u && "btn-chip-active")}
            onClick={() => {
              setUnderlying(u);
              setExpiry("");
            }}
          >
            {u}
          </button>
        ))}
        <button
          type="button"
          className="btn-chip !px-2 !text-[10px] opacity-50"
          title={SENSEX_OPTION_CHAIN_STATUS.userMessage}
          disabled
        >
          SENSEX
        </button>
        <select
          className="input !h-7 !py-0 text-[11px]"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          aria-label="Expiry"
        >
          {(chain?.expiries ?? []).map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          className="input !h-7 !w-[72px] !py-0 text-[11px]"
          value={String(strikeBand)}
          onChange={(e) => setStrikeBand(Number(e.target.value))}
          title="Strike band around ATM"
        >
          <option value="0.02">±2%</option>
          <option value="0.03">±3%</option>
          <option value="0.05">±5%</option>
          <option value="1">All</option>
        </select>
        <span className={cx("ml-auto text-[9px] font-bold uppercase tracking-wide", feed.tone)}>
          ● {feed.label}
        </span>
        {chain?.spot != null && (
          <span className="font-mono text-[10px] tabular-nums text-muted">
            Spot {fmtPrice(chain.spot)}
            {chain.atm_strike != null && (
              <span className="ml-2 text-brand">ATM {fmtPrice(chain.atm_strike)}</span>
            )}
          </span>
        )}
      </div>

      {(sensexBlocked || (initialUnderlying && !(UNDERLYINGS as readonly string[]).includes(initialUnderlying.toUpperCase()))) && (
        <p className="border-b border-subtle/30 px-2 py-1 text-[10px] text-faint">
          Chart symbol mapped to {underlying} chain (provider supports NIFTY/BANKNIFTY on NSE).
          {sensexBlocked ? " SENSEX options unavailable from current provider." : ""}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {q.isLoading && !chain && (
          <p className="px-3 py-8 text-center text-[11px] text-faint">Loading option chain…</p>
        )}
        <table className="w-full min-w-[720px] border-collapse text-left text-[10px]">
          <thead className="sticky top-0 z-10 bg-elevated text-[8px] uppercase tracking-wide text-faint">
            <tr>
              <th colSpan={6} className="border-b border-subtle px-1.5 py-1.5 text-center text-bull">
                CALL
              </th>
              <th className="border-b border-subtle px-1.5 py-1.5 text-center">Strike</th>
              <th colSpan={6} className="border-b border-subtle px-1.5 py-1.5 text-center text-bear">
                PUT
              </th>
            </tr>
            <tr>
              {["OI Δ", "OI", "Vol", "IV", "LTP", "B/A"].map((h) => (
                <th key={`c-${h}`} className="px-1.5 py-1 font-semibold">
                  {h}
                </th>
              ))}
              <th className="px-1.5 py-1 text-center font-semibold">Strike</th>
              {["B/A", "LTP", "IV", "Vol", "OI", "OI Δ"].map((h) => (
                <th key={`p-${h}`} className="px-1.5 py-1 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nearAtm.map((r) => {
              const atm = r.moneyness === "ATM" || r.strike === chain?.atm_strike;
              const putItm = chain?.spot != null && r.strike > chain.spot;
              const callItm = chain?.spot != null && r.strike < chain.spot;
              return (
                <tr
                  key={r.strike}
                  className={cx(
                    "border-t border-subtle/30",
                    atm && "bg-brand/10",
                    callItm && !atm && "bg-bull/5",
                  )}
                  title={
                    atm
                      ? "ATM"
                      : `Call ${callItm ? "ITM" : "OTM"} · Put ${putItm ? "ITM" : "OTM"}`
                  }
                >
                  <Cell n={r.call.oi_change} />
                  <Cell n={r.call.oi} />
                  <Cell n={r.call.volume} />
                  <Cell n={r.call.iv} digits={1} />
                  <Cell n={r.call.ltp} strong />
                  <td className="px-1.5 py-0.5 font-mono tabular-nums text-muted">
                    {fmtField(r.call.bid)}/{fmtField(r.call.ask)}
                  </td>
                  <td
                    className={cx(
                      "px-1.5 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums",
                      atm ? "text-brand" : "text-content",
                    )}
                  >
                    {fmtPrice(r.strike)}
                  </td>
                  <td className="px-1.5 py-0.5 font-mono tabular-nums text-muted">
                    {fmtField(r.put.bid)}/{fmtField(r.put.ask)}
                  </td>
                  <Cell n={r.put.ltp} strong />
                  <Cell n={r.put.iv} digits={1} />
                  <Cell n={r.put.volume} />
                  <Cell n={r.put.oi} />
                  <Cell n={r.put.oi_change} />
                </tr>
              );
            })}
            {!nearAtm.length && !q.isLoading && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-muted">
                  No strikes loaded. NSE may be closed or blocking the server IP.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-subtle/40 px-2 py-1 text-[9px] text-faint">
        <span>Source: {chain?.source || "Unavailable"}</span>
        <span>
          Last update:{" "}
          {chain?.as_of ? new Date(chain.as_of).toLocaleTimeString("en-IN", { hour12: false }) : "Unavailable"}
        </span>
        <span title="Greeks require a provider that supplies delta/gamma/theta/vega">
          Greeks: Unavailable from current provider
        </span>
        {q.isError && (
          <span className="text-bear">{(q.error as Error)?.message || "Chain unavailable"}</span>
        )}
      </div>
    </div>
  );
}

function Cell({ n, digits = 2, strong }: { n: number | null; digits?: number; strong?: boolean }) {
  return (
    <td className={cx("px-1.5 py-0.5 font-mono tabular-nums", strong && "font-semibold text-content")}>
      {fmtField(n, digits)}
    </td>
  );
}

/** Never show 0 for missing — 0 is a real market value only when provided. */
function fmtField(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "Unavailable";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
