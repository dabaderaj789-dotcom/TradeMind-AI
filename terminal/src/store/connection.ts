import { create } from "zustand";
import type { MarketId } from "../lib/markets";

export type ConnectionStatus = "live" | "connecting" | "disconnected";

interface ConnectionState {
  status: ConnectionStatus;
  lastTickAt: number | null;
  provider: string;
  market: MarketId | null;
  error: string | null;
  setStatus: (status: ConnectionStatus, patch?: Partial<Pick<ConnectionState, "lastTickAt" | "provider" | "market" | "error">>) => void;
  reset: () => void;
}

export const useConnection = create<ConnectionState>((set) => ({
  status: "connecting",
  lastTickAt: null,
  provider: "fastapi-quotes",
  market: null,
  error: null,
  setStatus: (status, patch) => set({ status, ...patch }),
  reset: () => set({ status: "connecting", lastTickAt: null, error: null }),
}));
