/**
 * Market depth + broker execution provider contracts.
 * UI consumes these shapes only — adapters plug in without changing chart/AI/OC.
 * No fake L2 or fills until a real provider is connected.
 */

import type { NormalizedTick } from "./types";

/** Single book level. */
export interface DepthLevel {
  price: number;
  quantity: number;
}

export interface NormalizedMarketDepth {
  symbolCode: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  spread?: number;
  ltp?: number;
  volume?: number;
  totalBidQty?: number;
  totalAskQty?: number;
  asOf: number;
  provider: string;
  source?: string;
}

export interface MarketDepthProvider {
  readonly providerId: string;
  /** True when credentials / feed can supply L2. */
  isConfigured(): boolean;
  supportsDepth(symbolCode: string): boolean;
  getDepth(symbolCode: string, signal?: AbortSignal): Promise<NormalizedMarketDepth | null>;
}

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "SL" | "SL_M" | "SL_L";
export type OrderValidity = "DAY" | "IOC" | "GTC";
export type ProductType = "MIS" | "NRML" | "CNC";

export interface PlaceOrderRequest {
  symbolCode: string;
  exchange?: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  product?: ProductType;
  validity?: OrderValidity;
}

export interface BrokerOrder {
  brokerOrderId: string;
  symbolCode: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  filledQuantity: number;
  price?: number;
  averagePrice?: number;
  triggerPrice?: number;
  status: "PENDING" | "OPEN" | "COMPLETED" | "CANCELLED" | "REJECTED";
  product?: ProductType;
  placedAt: string;
  updatedAt?: string;
  message?: string;
}

export interface BrokerPosition {
  symbolCode: string;
  quantity: number;
  averagePrice: number;
  ltp?: number;
  pnl?: number;
  pnlPct?: number;
  dayPnl?: number;
  product?: ProductType;
  exchange?: string;
}

export interface BrokerFunds {
  available: number;
  usedMargin?: number;
  collateral?: number;
  currency?: string;
  asOf: string;
}

export interface BrokerExecutionProvider {
  readonly providerId: string;
  isConfigured(): boolean;
  authenticate(): Promise<void>;
  placeOrder(req: PlaceOrderRequest): Promise<BrokerOrder>;
  modifyOrder(brokerOrderId: string, patch: Partial<PlaceOrderRequest>): Promise<BrokerOrder>;
  cancelOrder(brokerOrderId: string): Promise<BrokerOrder>;
  getOrders(signal?: AbortSignal): Promise<BrokerOrder[]>;
  getPositions(signal?: AbortSignal): Promise<BrokerPosition[]>;
  getFunds(signal?: AbortSignal): Promise<BrokerFunds | null>;
  getMargins?(signal?: AbortSignal): Promise<Record<string, number> | null>;
}

/** Null object — UI stays honest until a broker adapter is registered. */
export class UnavailableDepthProvider implements MarketDepthProvider {
  readonly providerId = "none";
  isConfigured() {
    return false;
  }
  supportsDepth() {
    return false;
  }
  async getDepth(): Promise<NormalizedMarketDepth | null> {
    return null;
  }
}

export class UnavailableBrokerProvider implements BrokerExecutionProvider {
  readonly providerId = "none";
  isConfigured() {
    return false;
  }
  async authenticate() {
    throw new Error("No broker execution provider configured");
  }
  async placeOrder(): Promise<BrokerOrder> {
    throw new Error("No broker execution provider configured");
  }
  async modifyOrder(): Promise<BrokerOrder> {
    throw new Error("No broker execution provider configured");
  }
  async cancelOrder(): Promise<BrokerOrder> {
    throw new Error("No broker execution provider configured");
  }
  async getOrders() {
    return [];
  }
  async getPositions() {
    return [];
  }
  async getFunds() {
    return null;
  }
}

let depthProvider: MarketDepthProvider = new UnavailableDepthProvider();
let brokerProvider: BrokerExecutionProvider = new UnavailableBrokerProvider();

export function registerMarketDepthProvider(p: MarketDepthProvider) {
  depthProvider = p;
}
export function registerBrokerExecutionProvider(p: BrokerExecutionProvider) {
  brokerProvider = p;
}
export function getMarketDepthProvider() {
  return depthProvider;
}
export function getBrokerExecutionProvider() {
  return brokerProvider;
}

/** Optional: depth can also be derived from tick bid/ask when L2 missing. */
export function tipHasTopOfBook(tick: NormalizedTick): boolean {
  return tick.bid != null && tick.ask != null;
}
