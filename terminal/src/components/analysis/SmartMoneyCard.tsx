import { useMemo } from "react";
import { useFvgs, useOrderBlocks, useSweeps } from "../../hooks/queries";
import { Card, Skeleton, Stat } from "../common/primitives";
import { Why } from "./Why";

export function SmartMoneyCard({ id, tf }: { id: string; tf: string }) {
  const ob = useOrderBlocks(id, tf);
  const fvg = useFvgs(id, tf);
  const sweep = useSweeps(id, tf);

  const mitigated = useMemo(
    () => (ob.data?.items ?? []).filter((o) => !o.mitigation_state.toLowerCase().includes("unmitigated")).length,
    [ob.data],
  );

  const loading = ob.isLoading || fvg.isLoading || sweep.isLoading;

  const obCount = ob.data?.items.length ?? 0;
  const fvgCount = fvg.data?.items.length ?? 0;
  const sweepCount = sweep.data?.items.length ?? 0;

  return (
    <Card
      title="Smart Money"
      actions={
        <Why
          title="Smart Money Concepts"
          summary={`${tf} institutional footprint`}
          reasoning="Smart-money analysis tracks unmitigated order blocks (institutional entry zones), fair value gaps (price inefficiencies likely to be revisited), and liquidity sweeps (stop-hunts before reversals). Higher active counts near price increase the odds of a reaction."
          contributions={[
            { label: "Active order blocks", value: String(obCount) },
            { label: "Active fair value gaps", value: String(fvgCount) },
            { label: "Liquidity sweeps", value: String(sweepCount) },
            { label: "Mitigated zones", value: String(mitigated) },
          ]}
          raw={{ orderBlocks: ob.data?.items, fvgs: fvg.data?.items, sweeps: sweep.data?.items }}
        />
      }
    >
      {loading ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Order Blocks" value={obCount} tone={obCount > 0 ? "brand" : "neutral"} />
          <Stat label="Fair Value Gaps" value={fvgCount} tone={fvgCount > 0 ? "info" : "neutral"} />
          <Stat label="Liquidity Sweeps" value={sweepCount} tone={sweepCount > 0 ? "warn" : "neutral"} />
          <Stat label="Mitigated Zones" value={mitigated} tone="neutral" />
        </div>
      )}
    </Card>
  );
}
