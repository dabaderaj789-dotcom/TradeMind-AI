/**
 * Frontend market-data provider interface.
 * Transport adapters (Binance WS, FastAPI tick poll) normalize into NormalizedTick.
 * Active transport is chosen by config / market category — not by chart components.
 */

import type { MarketId } from "../markets";
import type { NormalizedTick, ProviderId } from "./types";

export type StreamStatus = "live" | "connecting" | "disconnected";

export interface MarketDataTransport {
  readonly id: ProviderId | string;
  readonly label: string;
  readonly shortLabel: string;
  readonly markets: MarketId[];
  connect(opts: {
    symbolId: string;
    symbolCode?: string;
    timeframe: string;
    onTick: (tick: NormalizedTick) => void;
    onStatus: (status: StreamStatus, detail?: string) => void;
  }): () => void;
}

/** @deprecated use MarketDataTransport — kept for existing imports */
export type MarketDataProvider = MarketDataTransport;

export type TickUpdate = NormalizedTick;

export function connectionLabel(status: StreamStatus): string {
  if (status === "live") return "Connected";
  if (status === "connecting") return "Connecting";
  return "Offline";
}
