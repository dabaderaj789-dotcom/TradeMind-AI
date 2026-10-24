import { useState } from "react";
import { cx } from "../../lib/format";
import { UnavailableProviderPanel } from "./UnavailableProviderPanel";

const TABS = ["Open", "Completed", "Cancelled", "Rejected"] as const;

export function OrdersBlotterPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Open");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-0.5 border-b border-subtle/40 px-1.5 py-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={cx(
              "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              tab === t ? "bg-brand/12 text-brand" : "text-faint hover:text-content",
            )}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <UnavailableProviderPanel
        title={`${tab} orders`}
        detail="Unavailable from current provider — order blotter appears when a broker feed is connected."
      />
    </div>
  );
}
