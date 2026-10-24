/**
 * Order ticket UI shell — confirmation-gated, no live broker submit.
 */

import { useState } from "react";
import { UnavailableProviderPanel } from "./UnavailableProviderPanel";

const ORDER_TYPES = ["Market", "Limit", "Stop Loss", "SL-M", "SL-L"] as const;

export function OrderTicketPanel({ symbolCode }: { symbolCode?: string }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<(typeof ORDER_TYPES)[number]>("Limit");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-subtle/40 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-faint">Order ticket</div>
        <div className="mt-0.5 font-display text-[13px] font-semibold text-content">
          {symbolCode || "—"}
        </div>
      </div>

      <div className="space-y-2.5 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            className={
              side === "BUY"
                ? "rounded border border-bull/40 bg-bull/10 py-1.5 text-[11px] font-bold text-bull"
                : "rounded border border-subtle py-1.5 text-[11px] font-bold text-faint"
            }
            onClick={() => setSide("BUY")}
          >
            BUY
          </button>
          <button
            type="button"
            className={
              side === "SELL"
                ? "rounded border border-bear/40 bg-bear/10 py-1.5 text-[11px] font-bold text-bear"
                : "rounded border border-subtle py-1.5 text-[11px] font-bold text-faint"
            }
            onClick={() => setSide("SELL")}
          >
            SELL
          </button>
        </div>

        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-wide text-faint">Type</span>
          <select
            className="mt-1 w-full rounded border border-subtle bg-elevated px-2 py-1.5 text-[12px]"
            value={type}
            onChange={(e) => setType(e.target.value as (typeof ORDER_TYPES)[number])}
          >
            {ORDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-wide text-faint">Quantity</span>
          <input
            className="mt-1 w-full rounded border border-subtle bg-elevated px-2 py-1.5 font-mono text-[12px]"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>

        {type !== "Market" && type !== "SL-M" && (
          <label className="block">
            <span className="text-[9px] font-bold uppercase tracking-wide text-faint">Price</span>
            <input
              className="mt-1 w-full rounded border border-subtle bg-elevated px-2 py-1.5 font-mono text-[12px]"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="—"
            />
          </label>
        )}

        {!confirm ? (
          <button
            type="button"
            className="w-full rounded bg-brand py-2 text-[11px] font-bold uppercase tracking-wide text-white"
            onClick={() => setConfirm(true)}
          >
            Review order
          </button>
        ) : (
          <div className="space-y-2 rounded border border-subtle bg-elevated/60 p-2.5">
            <p className="text-[11px] text-muted">
              Confirm {side} {qty} {symbolCode || "instrument"} ({type}
              {price ? ` @ ${price}` : ""}). No broker is connected — order will not be sent.
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="flex-1 rounded border border-subtle py-1.5 text-[11px] font-semibold"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded bg-elevated py-1.5 text-[11px] font-semibold text-faint"
                disabled
                title="Broker execution not connected"
              >
                Place (unavailable)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-subtle/40">
        <UnavailableProviderPanel
          title="Execution"
          detail="Unavailable from current provider — connect a broker to place live orders."
        />
      </div>
    </div>
  );
}
