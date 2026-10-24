/**
 * Compatibility shim — prefer importing from `../marketData`.
 * Existing chart/hooks keep working without import churn.
 */

export {
  connectionLabel,
  createBinanceTradeProvider,
  createFastApiQuoteProvider,
  createFastApiTickProvider,
  providerForCategory,
  resolveProvider,
  type MarketDataProvider,
  type StreamStatus,
  type TickUpdate,
} from "../marketData";

export type { StreamStatus as ConnectionStatus } from "../marketData";
