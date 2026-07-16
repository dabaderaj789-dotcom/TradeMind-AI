import { useMemo } from "react";
import type { TradeSetup } from "../lib/types";
import { useStrategies, useStrategyDetail } from "./queries";

/** Resolves the strategy that best matches the strongest active setup. */
export function useRecommendation(id: string | null, tf: string, topSetup: TradeSetup | null) {
  const strategies = useStrategies();

  const matched = useMemo(() => {
    if (!topSetup) return null;
    return (
      strategies.data?.items.find((s) => s.required_setup_types.includes(topSetup.setup_type)) ?? null
    );
  }, [strategies.data, topSetup]);

  const detail = useStrategyDetail(matched?.strategy_id ?? null, id, tf);

  return {
    strategy: matched,
    detail: detail.data ?? (matched ? { strategy: matched, recent_plans: [] } : null),
    isLoading: strategies.isLoading || detail.isLoading,
  };
}
