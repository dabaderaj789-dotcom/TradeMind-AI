/**
 * V7 latency telemetry — latest tick timings for the Latency Lab page.
 */

import { create } from "zustand";

export interface LatencySample {
  symbolId: string;
  price: number;
  source?: string;
  providerTs?: number;
  backendSentAt?: number;
  frontendReceivedAt: number;
  renderAt?: number;
  feedDelayMs?: number;
  backendDelayMs?: number;
  transportDelayMs?: number;
  renderDelayMs?: number;
  totalDelayMs?: number;
  bottleneck?: string;
}

interface LatencyState {
  latest: LatencySample | null;
  history: LatencySample[];
  push: (s: LatencySample) => void;
  markRendered: (at?: number) => void;
}

const MAX = 120;

export const useLatencyLab = create<LatencyState>((set, get) => ({
  latest: null,
  history: [],
  push: (s) =>
    set((st) => {
      const transportDelayMs =
        s.backendSentAt != null
          ? Math.max(0, s.frontendReceivedAt - s.backendSentAt)
          : undefined;
      const totalDelayMs =
        s.providerTs != null
          ? Math.max(0, s.frontendReceivedAt - s.providerTs)
          : s.feedDelayMs != null || s.backendDelayMs != null
            ? (s.feedDelayMs ?? 0) + (s.backendDelayMs ?? 0) + (transportDelayMs ?? 0)
            : undefined;
      const sample: LatencySample = {
        ...s,
        transportDelayMs,
        totalDelayMs,
      };
      return {
        latest: sample,
        history: [...st.history.slice(-(MAX - 1)), sample],
      };
    }),
  markRendered: (at = Date.now()) => {
    const cur = get().latest;
    if (!cur) return;
    const renderDelayMs = Math.max(0, at - cur.frontendReceivedAt);
    const next = {
      ...cur,
      renderAt: at,
      renderDelayMs,
      totalDelayMs:
        cur.providerTs != null
          ? Math.max(0, at - cur.providerTs)
          : (cur.totalDelayMs ?? 0) + renderDelayMs,
    };
    set((st) => ({
      latest: next,
      history: st.history.length
        ? [...st.history.slice(0, -1), next]
        : [next],
    }));
  },
}));
