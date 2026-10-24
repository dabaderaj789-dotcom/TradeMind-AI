/**
 * Market-data abstraction — public entry for the terminal.
 */

export type {
  InstrumentMetadata,
  MarketStatus,
  NormalizedGreeks,
  NormalizedOHLC,
  NormalizedOptionChain,
  NormalizedOptionLeg,
  NormalizedOptionStrike,
  NormalizedTick,
  ProviderId,
} from "./types";

export type {
  BrokerExecutionProvider,
  BrokerFunds,
  BrokerOrder,
  BrokerPosition,
  MarketDepthProvider,
  NormalizedMarketDepth,
  PlaceOrderRequest,
} from "./executionContracts";

export {
  getBrokerExecutionProvider,
  getMarketDepthProvider,
  registerBrokerExecutionProvider,
  registerMarketDepthProvider,
  UnavailableBrokerProvider,
  UnavailableDepthProvider,
} from "./executionContracts";

export type { MarketDataProvider, MarketDataTransport, StreamStatus, TickUpdate } from "./provider";
export { connectionLabel } from "./provider";

export {
  providerForCategory,
  registerTransport,
  resolveProvider,
  resolveTransport,
} from "./registry";

export {
  createBinanceTradeProvider,
  createBinanceTradeTransport,
  createFastApiQuoteProvider,
  createFastApiTickProvider,
  createFastApiTickTransport,
} from "./transports";
