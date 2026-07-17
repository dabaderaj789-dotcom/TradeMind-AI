/** Asset-class markets for the AI Terminal (UI filter — not exchange codes). */

export type MarketId = "india" | "crypto" | "usa" | "forex" | "commodities" | "indices";

export type MarketLeafId =
  | "india.indices"
  | "india.stocks"
  | "india.futures"
  | "india.sector"
  | "india.etfs"
  | "crypto.spot"
  | "crypto.futures"
  | "usa.indices"
  | "usa.stocks"
  | "usa.etfs"
  | "forex"
  | "commodities"
  | "indices";

export interface MarketDef {
  id: MarketId;
  label: string;
  short: string;
  hint: string;
}

export interface MarketLeafDef {
  id: MarketLeafId;
  label: string;
}

export interface MarketTreeNode {
  id: MarketId;
  label: string;
  children?: MarketLeafDef[];
}

/** Flat list kept for Scanner / prefs compatibility. */
export const MARKETS: MarketDef[] = [
  { id: "india", label: "India", short: "IN", hint: "NSE indices, stocks, F&O, ETFs" },
  { id: "crypto", label: "Crypto", short: "CR", hint: "Digital assets & USDT pairs" },
  { id: "usa", label: "USA", short: "US", hint: "US indices, stocks & ETFs" },
  { id: "forex", label: "Forex", short: "FX", hint: "Currency pairs" },
  { id: "commodities", label: "Commodities", short: "CM", hint: "Metals, energy, softs" },
  { id: "indices", label: "Indices", short: "IX", hint: "Global equity & vol indexes" },
];

/** TradingView-style expandable market taxonomy. */
export const MARKET_TREE: MarketTreeNode[] = [
  {
    id: "india",
    label: "India",
    children: [
      { id: "india.indices", label: "Indices" },
      { id: "india.stocks", label: "Stocks" },
      { id: "india.futures", label: "Futures & Options" },
      { id: "india.sector", label: "Sector Indices" },
      { id: "india.etfs", label: "ETFs" },
    ],
  },
  {
    id: "crypto",
    label: "Crypto",
    children: [
      { id: "crypto.spot", label: "Spot" },
      { id: "crypto.futures", label: "Futures" },
    ],
  },
  {
    id: "usa",
    label: "USA",
    children: [
      { id: "usa.indices", label: "Indices" },
      { id: "usa.stocks", label: "Stocks" },
      { id: "usa.etfs", label: "ETFs" },
    ],
  },
  { id: "forex", label: "Forex" },
  { id: "commodities", label: "Commodities" },
  { id: "indices", label: "Indices" },
];

const CRYPTO_RE = /(btc|eth|sol|bnb|xrp|ada|doge|avax|dot|link|matic|usdt|usdc|crypto)/i;
const FOREX_RE = /(eurusd|gbpusd|usdjpy|usdchf|audusd|nzdusd|usdcad|fx|forex)/i;
const COMMODITY_RE = /(gold|xau|silver|xag|oil|brent|wti|copper|natgas|commodity)/i;
const INDIA_INDEX_RE = /(nifty50|banknifty|finnifty|midcpnifty|sensex|india.?vix|^nifty$)/i;
const SECTOR_INDEX_RE =
  /(niftyit|niftypharma|niftyauto|niftymetal|niftyfmcg|niftyenergy|niftyrealty|niftymedia|niftypsubank|niftypvtbank|niftyinfra|niftymidcap|cnxit|cnxpharma|cnxauto)/i;
const INDIA_RE =
  /(nifty|banknifty|finnifty|sensex|nse|bse|reliance|tcs|infy|hdfc|icici|sbin|india|inr|bees)/i;
const US_INDEX_RE = /(spx|ndx|dji|nasdaq|dow|vix|spy|qqq)/i;
const US_RE = /(nasdaq|nyse|amex|\.us\b|usa|united states)/i;
const INDEX_RE = /(spx|ndx|dji|nasdaq|dow|vix|dax|ftse|nikkei|index)/i;
const ETF_RE = /\b(etf|bees)\b/i;
const FUTURES_RE = /(perp|perpetual|futures?|\.f\b|fut\b)/i;

export interface SymbolClassifiable {
  symbol_code: string;
  name?: string;
  market_type?: string;
  exchange_code?: string;
  instrument?: string;
}

/** Classify a symbol into a market browser leaf — prefer API instrument metadata. */
export function classifyMarketLeaf(s: SymbolClassifiable): MarketLeafId {
  const code = s.symbol_code ?? "";
  const name = s.name ?? "";
  const marketType = (s.market_type ?? "").toLowerCase();
  const exch = (s.exchange_code ?? "").toLowerCase();
  const instrument = (s.instrument ?? "").toLowerCase();
  const hay = `${code} ${name} ${marketType} ${instrument}`;

  // India (NSE / BSE) — instrument metadata drives category.
  if (exch === "nse" || exch === "bse") {
    if (instrument === "futures" || instrument === "options" || FUTURES_RE.test(code)) {
      return "india.futures";
    }
    if (instrument === "etf" || ETF_RE.test(hay)) return "india.etfs";
    if (instrument === "sector_index" || SECTOR_INDEX_RE.test(code) || SECTOR_INDEX_RE.test(name)) {
      return "india.sector";
    }
    if (instrument === "index" || INDIA_INDEX_RE.test(code) || INDIA_INDEX_RE.test(name)) {
      return "india.indices";
    }
    return "india.stocks";
  }

  if (FOREX_RE.test(hay) || marketType === "forex") return "forex";
  if (COMMODITY_RE.test(hay) || marketType === "commodity") return "commodities";

  if (US_RE.test(hay) || exch === "nasdaq" || exch === "nyse") {
    if (ETF_RE.test(hay) || instrument === "etf") return "usa.etfs";
    if (instrument === "index" || US_INDEX_RE.test(hay)) return "usa.indices";
    return "usa.stocks";
  }

  if (INDEX_RE.test(hay) && !INDIA_RE.test(hay)) return "indices";

  if (
    CRYPTO_RE.test(hay) ||
    /USDT$/i.test(code) ||
    marketType === "crypto" ||
    exch === "binance"
  ) {
    if (FUTURES_RE.test(hay) || instrument === "futures" || /PERP$/i.test(code)) return "crypto.futures";
    return "crypto.spot";
  }

  if (INDIA_RE.test(hay) || marketType === "equity") {
    if (instrument === "sector_index" || SECTOR_INDEX_RE.test(code)) return "india.sector";
    if (INDIA_INDEX_RE.test(code) || INDIA_INDEX_RE.test(name) || instrument === "index") {
      return "india.indices";
    }
    if (instrument === "etf" || ETF_RE.test(hay)) return "india.etfs";
    if (instrument === "futures") return "india.futures";
    return "india.stocks";
  }

  return "crypto.spot";
}

/** Top-level market for prefs / scanner filtering. */
export function classifySymbol(
  code: string,
  name = "",
  marketType = "",
  exchangeCode = "",
  instrument = "",
): MarketId {
  const leaf = classifyMarketLeaf({
    symbol_code: code,
    name,
    market_type: marketType,
    exchange_code: exchangeCode,
    instrument,
  });
  return leafRoot(leaf);
}

export function leafRoot(leaf: MarketLeafId): MarketId {
  const i = leaf.indexOf(".");
  return (i === -1 ? leaf : leaf.slice(0, i)) as MarketId;
}

/**
 * Strict market filter — no soft fallback to other asset classes.
 */
export function filterByMarket<T extends SymbolClassifiable>(items: T[], market: MarketId | ""): T[] {
  if (!market) return items;
  return items.filter(
    (s) =>
      classifySymbol(
        s.symbol_code,
        s.name ?? "",
        s.market_type ?? "",
        s.exchange_code ?? "",
        s.instrument ?? "",
      ) === market,
  );
}

export function filterByLeaf<T extends SymbolClassifiable>(items: T[], leaf: MarketLeafId | ""): T[] {
  if (!leaf) return items;
  return items.filter((s) => classifyMarketLeaf(s) === leaf);
}

/** Rank search hits: code prefix > code include > name include. */
export function rankSymbolSearch<T extends { symbol_code: string; name?: string }>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored = items
    .map((s) => {
      const code = s.symbol_code.toLowerCase();
      const name = (s.name ?? "").toLowerCase();
      let score = 0;
      if (code === q) score = 100;
      else if (code.startsWith(q)) score = 80;
      else if (code.includes(q)) score = 60;
      else if (name.startsWith(q)) score = 40;
      else if (name.includes(q)) score = 20;
      else score = -1;
      return { s, score };
    })
    .filter((x) => x.score >= 0);
  scored.sort((a, b) => b.score - a.score || a.s.symbol_code.localeCompare(b.s.symbol_code));
  return scored.map((x) => x.s);
}

/** Exchange hint used when searching/listing for a market category. */
export function exchangeHintForMarket(market: MarketId): string | undefined {
  if (market === "india") return "nse";
  if (market === "crypto") return "binance";
  return undefined;
}

export function leafLabel(leaf: MarketLeafId): string {
  for (const node of MARKET_TREE) {
    if (!node.children) {
      if ((node.id as string) === leaf) return node.label;
      continue;
    }
    const child = node.children.find((c) => c.id === leaf);
    if (child) return `${node.label} · ${child.label}`;
  }
  return leaf;
}
