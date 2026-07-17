/**
 * Per-market live data provider registry.
 * Polls FastAPI quotes — never invents prices or analysis.
 */
import type { MarketId } from "../markets";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";

export type StreamStatus = "live" | "connecting" | "disconnected";
export type ConnectionStatus = StreamStatus;

export interface TickUpdate {
  symbolId: string;
  price: number;
  ts: number;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly markets: MarketId[];
  connect(opts: {
    symbolId: string;
    timeframe: string;
    onTick: (tick: TickUpdate) => void;
    onStatus: (status: StreamStatus, detail?: string) => void;
  }): () => void;
}

export function connectionLabel(status: StreamStatus): string {
  if (status === "live") return "Live";
  if (status === "connecting") return "Connecting";
  return "Disconnected";
}

export function providerForCategory(market: MarketId): MarketDataProvider {
  return resolveProvider(market);
}

/** FastAPI quote poller — price updates from GET /quotes/{id} only. */
export function createFastApiQuoteProvider(): MarketDataProvider {
  return {
    id: "fastapi-quotes",
    label: "TradeMind API",
    shortLabel: "API",
    markets: ["india", "crypto", "usa", "forex", "commodities", "indices"],
    connect({ symbolId, onTick, onStatus }) {
      let stopped = false;
      let fails = 0;
      let quoteTimer: ReturnType<typeof setInterval> | null = null;
      let healthTimer: ReturnType<typeof setInterval> | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        stopped = true;
        if (quoteTimer) clearInterval(quoteTimer);
        if (healthTimer) clearInterval(healthTimer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
      };

      const probeHealth = async () => {
        if (stopped) return;
        if (fails > 0) onStatus("connecting");
        try {
          const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) throw new Error(`health ${res.status}`);
          fails = 0;
          onStatus("live");
        } catch (err) {
          fails += 1;
          onStatus("disconnected", err instanceof Error ? err.message : "offline");
          if (!stopped) {
            reconnectTimer = setTimeout(probeHealth, Math.min(8000, 1000 * fails));
          }
        }
      };

      const pullQuote = async () => {
        if (stopped) return;
        try {
          const r = await fetch(`${API_BASE}/quotes/${symbolId}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (!r.ok) return;
          const body = await r.json();
          const price = Number(body?.current_price);
          if (Number.isFinite(price) && price > 0) {
            onTick({
              symbolId,
              price,
              ts: Date.parse(body?.last_updated) || Date.now(),
            });
            fails = 0;
            onStatus("live");
          }
        } catch {
          /* health probe handles disconnect UX */
        }
      };

      onStatus("connecting");
      void probeHealth();
      void pullQuote();
      healthTimer = setInterval(() => void probeHealth(), 12_000);
      quoteTimer = setInterval(() => void pullQuote(), 5_000);

      return cleanup;
    },
  };
}

const registry = new Map<string, MarketDataProvider>();

export function registerProvider(provider: MarketDataProvider) {
  registry.set(provider.id, provider);
}

export function resolveProvider(market: MarketId): MarketDataProvider {
  for (const p of registry.values()) {
    if (p.markets.includes(market)) return p;
  }
  if (!registry.has("fastapi-quotes")) registerProvider(createFastApiQuoteProvider());
  return registry.get("fastapi-quotes")!;
}

registerProvider(createFastApiQuoteProvider());
