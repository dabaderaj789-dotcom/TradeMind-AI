/**
 * Resolve which transport feeds the chart tip.
 *
 * Override with VITE_MARKET_DATA_TRANSPORT=binance-ws|fastapi-tick
 * Chart code should only call resolveTransport(market) — never construct brokers.
 */

import type { MarketId } from "../markets";
import type { MarketDataTransport } from "./provider";
import { createBinanceTradeTransport, createFastApiTickTransport } from "./transports";

const registry = new Map<string, MarketDataTransport>();

export function registerTransport(transport: MarketDataTransport) {
  registry.set(transport.id, transport);
}

export function resolveTransport(market: MarketId): MarketDataTransport {
  const override = (import.meta.env.VITE_MARKET_DATA_TRANSPORT as string | undefined)?.trim();
  if (override && registry.has(override)) {
    return registry.get(override)!;
  }
  if (market === "crypto") {
    if (!registry.has("binance-ws")) registerTransport(createBinanceTradeTransport());
    return registry.get("binance-ws")!;
  }
  if (!registry.has("fastapi-tick")) registerTransport(createFastApiTickTransport());
  return registry.get("fastapi-tick")!;
}

/** @deprecated alias */
export function resolveProvider(market: MarketId): MarketDataTransport {
  return resolveTransport(market);
}

/** @deprecated alias */
export function providerForCategory(market: MarketId): MarketDataTransport {
  return resolveTransport(market);
}

registerTransport(createBinanceTradeTransport());
registerTransport(createFastApiTickTransport());
