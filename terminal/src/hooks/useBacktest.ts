import { useMutation, useQuery } from "@tanstack/react-query";
import { endpoints } from "../lib/endpoints";
import { useBacktestStore } from "../store/backtest";

const TERMINAL_STATES = ["completed", "failed", "error", "cancelled"];

export function useBacktest(id: string, tf: string) {
  const key = `${id}:${tf}`;
  const runId = useBacktestStore((s) => s.runs[key]);
  const setRun = useBacktestStore((s) => s.setRun);

  const start = useMutation({
    mutationFn: (strategyId: string) =>
      endpoints.backtestStart({ symbol_id: id, timeframe: tf, strategy_id: strategyId, candle_limit: 5000 }),
    onSuccess: (res) => setRun(key, res.run_id),
  });

  const status = useQuery({
    queryKey: ["backtestStatus", runId],
    queryFn: ({ signal }) => endpoints.backtestStatus(runId!, signal),
    enabled: !!runId,
    refetchInterval: (q) => {
      const s = q.state.data?.status?.toLowerCase();
      return s && TERMINAL_STATES.includes(s) ? false : 1500;
    },
    retry: 0,
  });

  const done = status.data?.status ? TERMINAL_STATES.includes(status.data.status.toLowerCase()) : false;
  const completed = status.data?.status?.toLowerCase() === "completed";

  const report = useQuery({
    queryKey: ["backtestReport", runId],
    queryFn: ({ signal }) => endpoints.backtestReport(runId!, signal),
    enabled: !!runId && completed,
    retry: 0,
  });

  const trades = useQuery({
    queryKey: ["backtestTrades", runId],
    queryFn: ({ signal }) => endpoints.backtestTrades(runId!, signal),
    enabled: !!runId && completed,
    retry: 0,
  });

  return {
    runId,
    start,
    status: status.data,
    isRunning: !!runId && !done,
    completed,
    failed: done && !completed,
    report,
    trades,
  };
}
