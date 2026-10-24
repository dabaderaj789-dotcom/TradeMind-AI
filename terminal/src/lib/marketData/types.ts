/**
 * Normalized market-data contracts for the terminal.
 * Chart tip, option chain, and AI UI must consume only these shapes —
 * never Angel / Upstox / Dhan / TrueData payloads.
 */

export type MarketStatus = "OPEN" | "CLOSED";

export type ProviderId =
  | "yahoo_nse"
  | "binance"
  | "angel"
  | "upstox"
  | "dhan"
  | "zerodha"
  | "truedata"
  | "global_datafeeds"
  | "fastapi-tick"
  | "binance-ws";

export interface NormalizedTick {
  symbolId: string;
  symbolCode?: string;
  price: number;
  ts: number;
  volume?: number;
  bid?: number;
  ask?: number;
  oi?: number;
  marketStatus?: MarketStatus;
  provider?: string;
  source?: string;
  providerTs?: number;
  backendSentAt?: number;
  frontendReceivedAt?: number;
  feedDelayMs?: number;
  backendDelayMs?: number;
  bottleneck?: string;
}

export interface NormalizedOHLC {
  symbolCode: string;
  timeframe: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
  isComplete?: boolean;
  provider?: string;
}

export interface NormalizedGreeks {
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;
}

export interface NormalizedOptionLeg {
  strike: number;
  optionType: "CE" | "PE";
  ltp?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  oi?: number;
  oiChange?: number;
  greeks?: NormalizedGreeks;
}

export interface NormalizedOptionStrike {
  strike: number;
  moneyness: "ITM" | "ATM" | "OTM";
  call: NormalizedOptionLeg;
  put: NormalizedOptionLeg;
}

export interface NormalizedOptionChain {
  underlying: string;
  spot?: number;
  atmStrike?: number;
  expiry?: string;
  expiries: string[];
  rows: NormalizedOptionStrike[];
  asOf: number;
  provider?: string;
  source?: string;
}

export interface InstrumentMetadata {
  symbolCode: string;
  name: string;
  exchange: string;
  segment: string;
  instrumentType: string;
  lotSize?: number;
  tickSize?: number;
  providerToken?: string;
  tradingsymbol?: string;
  provider?: string;
}
