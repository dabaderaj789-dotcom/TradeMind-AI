import { useQuery } from "@tanstack/react-query";
import { getMarketDepthProvider } from "../../lib/marketData/executionContracts";
import { UnavailableProviderPanel } from "./UnavailableProviderPanel";
import { cx, fmtPrice } from "../../lib/format";

/**
 * Market Depth workspace — production-ready UI.
 * Data only when a MarketDepthProvider is registered and configured.
 */
export function MarketDepthPanel({ symbolCode }: { symbolCode?: string }) {
  const provider = getMarketDepthProvider();
  const configured = provider.isConfigured() && !!symbolCode && provider.supportsDepth(symbolCode);

  const q = useQuery({
    queryKey: ["market-depth", provider.providerId, symbolCode],
    queryFn: ({ signal }) => provider.getDepth(symbolCode!, signal),
    enabled: configured,
    refetchInterval: configured ? 1_000 : false,
    retry: 0,
  });

  if (!configured || !q.data) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-subtle/40 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-faint">Market depth</div>
          <div className="font-mono text-[12px] font-semibold text-content">{symbolCode || "—"}</div>
        </div>
        <UnavailableProviderPanel
          title="Order book"
          detail={`Unavailable from current provider (${provider.providerId}). Register a MarketDepthProvider when L2 is connected — UI is ready.`}
        />
      </div>
    );
  }

  const d = q.data;
  const age = Date.now() - d.asOf;
  const live = age <= 3_000;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-subtle/40 px-3 py-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-faint">Market depth</div>
          <div className="font-mono text-[12px] font-semibold">{symbolCode}</div>
        </div>
        <span className={cx("ml-auto text-[9px] font-bold uppercase", live ? "text-bull" : "text-warn")}>
          ● {live ? "LIVE" : "STALE"}
        </span>
        <span className="text-[9px] text-faint">{d.provider}</span>
      </div>
      <div className="grid grid-cols-2 gap-0 overflow-auto text-[10px]">
        <div className="border-r border-subtle/40">
          <div className="bg-elevated px-2 py-1 font-bold uppercase text-bull">Bid</div>
          {d.bids.map((b, i) => (
            <div key={`b-${i}`} className="flex justify-between px-2 py-0.5 font-mono tabular-nums">
              <span>{b.quantity}</span>
              <span className="text-bull">{fmtPrice(b.price)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="bg-elevated px-2 py-1 font-bold uppercase text-bear">Ask</div>
          {d.asks.map((a, i) => (
            <div key={`a-${i}`} className="flex justify-between px-2 py-0.5 font-mono tabular-nums">
              <span className="text-bear">{fmtPrice(a.price)}</span>
              <span>{a.quantity}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto flex gap-3 border-t border-subtle/40 px-2 py-1 text-[9px] text-faint">
        <span>Spread {d.spread != null ? fmtPrice(d.spread) : "Unavailable"}</span>
        <span>LTP {d.ltp != null ? fmtPrice(d.ltp) : "Unavailable"}</span>
        <span>Vol {d.volume != null ? d.volume : "Unavailable"}</span>
      </div>
    </div>
  );
}
