/**
 * TradeMind V3 — supported instruments only.
 * Display names for UI; `code` matches exchange symbol_code from the API.
 */

export interface UniverseDef {
  code: string;
  display: string;
  exchange: "nse" | "binance";
  name: string;
}

export const UNIVERSE: UniverseDef[] = [
  { code: "NIFTY50", display: "NIFTY", exchange: "nse", name: "Nifty 50 Index" },
  { code: "BANKNIFTY", display: "BANKNIFTY", exchange: "nse", name: "Nifty Bank Index" },
  { code: "SENSEX", display: "SENSEX", exchange: "nse", name: "BSE Sensex" },
  { code: "BTCUSDT", display: "BTCUSDT", exchange: "binance", name: "Bitcoin / USDT" },
];

export const UNIVERSE_CODES = new Set(UNIVERSE.map((u) => u.code.toUpperCase()));

export function isUniverseCode(code: string | undefined | null): boolean {
  if (!code) return false;
  const c = code.toUpperCase();
  return UNIVERSE_CODES.has(c) || c === "NIFTY";
}

export function displayCode(symbolCode: string | undefined | null): string {
  if (!symbolCode) return "—";
  const u = UNIVERSE.find((x) => x.code.toUpperCase() === symbolCode.toUpperCase());
  return u?.display ?? symbolCode;
}

export function universeMeta(symbolCode: string | undefined | null): UniverseDef | null {
  if (!symbolCode) return null;
  return UNIVERSE.find((x) => x.code.toUpperCase() === symbolCode.toUpperCase()) ?? null;
}
