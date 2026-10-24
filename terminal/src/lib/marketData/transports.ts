/**
 * Concrete transports that emit NormalizedTick only.
 * Backend still owns broker selection via MARKET_DATA_*_PROVIDER;
 * these transports speak to Binance public WS or TradeMind tick API.
 */

import type { MarketDataTransport } from "./provider";
import type { NormalizedTick } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";

/** Safari-safe abort (AbortSignal.timeout is missing on older iOS). */
function abortAfter(ms: number): AbortSignal {
  const ctrl = new AbortController();
  window.setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export function createBinanceTradeTransport(): MarketDataTransport {
  return {
    id: "binance-ws",
    label: "Binance WebSocket",
    shortLabel: "WS",
    markets: ["crypto"],
    connect({ symbolId, symbolCode, onTick, onStatus }) {
      const code = (symbolCode || "").toLowerCase();
      if (!code) {
        return createFastApiTickTransport().connect({
          symbolId,
          symbolCode,
          timeframe: "1m",
          onTick,
          onStatus,
        });
      }

      let stopped = false;
      let ws: WebSocket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let fails = 0;

      const cleanup = () => {
        stopped = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        try {
          ws?.close();
        } catch {
          /* */
        }
        ws = null;
      };

      const open = () => {
        if (stopped) return;
        onStatus("connecting");
        const url = `wss://data-stream.binance.vision/ws/${code}@trade`;
        try {
          ws = new WebSocket(url);
        } catch (err) {
          fails += 1;
          onStatus("disconnected", err instanceof Error ? err.message : "ws failed");
          reconnectTimer = setTimeout(open, Math.min(8000, 1000 * fails));
          return;
        }

        ws.onopen = () => {
          fails = 0;
          onStatus("live");
        };
        ws.onclose = () => {
          if (stopped) return;
          onStatus("disconnected", "ws closed");
          fails += 1;
          reconnectTimer = setTimeout(open, Math.min(8000, 1000 * fails));
        };
        ws.onerror = () => {
          onStatus("disconnected", "ws error");
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              p?: string;
              T?: number;
              q?: string;
            };
            const price = Number(msg.p);
            const ts = Number(msg.T) || Date.now();
            const vol = Number(msg.q);
            if (!Number.isFinite(price) || price <= 0) return;
            const frontendReceivedAt = Date.now();
            const tick: NormalizedTick = {
              symbolId,
              price,
              ts,
              volume: Number.isFinite(vol) ? vol : undefined,
              providerTs: ts,
              frontendReceivedAt,
              feedDelayMs: Math.max(0, frontendReceivedAt - ts),
              backendDelayMs: 0,
              bottleneck: "transport",
              source: "binance_ws_trade",
              provider: "binance",
            };
            onTick(tick);
            onStatus("live");
          } catch {
            /* ignore malformed */
          }
        };
      };

      open();
      return cleanup;
    },
  };
}

export function createFastApiTickTransport(): MarketDataTransport {
  return {
    id: "fastapi-tick",
    label: "TradeMind Tick API",
    shortLabel: "API",
    markets: ["india", "crypto", "usa", "forex", "commodities", "indices"],
    connect({ symbolId, onTick, onStatus }) {
      let stopped = false;
      let quoteTimer: ReturnType<typeof setInterval> | null = null;
      let healthTimer: ReturnType<typeof setInterval> | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let fails = 0;
      let inFlight = false;

      const cleanup = () => {
        stopped = true;
        if (quoteTimer) clearInterval(quoteTimer);
        if (healthTimer) clearInterval(healthTimer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
      };

      const probeHealth = async () => {
        if (stopped) return;
        try {
          const res = await fetch(`${API_BASE}/health`, { signal: abortAfter(20_000) });
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

      const pullTick = async () => {
        if (stopped || inFlight) return;
        inFlight = true;
        const t0 = Date.now();
        try {
          const r = await fetch(`${API_BASE}/market-engine/tick/${symbolId}`, {
            signal: abortAfter(20_000),
          });
          if (!r.ok) {
            const q = await fetch(`${API_BASE}/quotes/${symbolId}`, {
              signal: abortAfter(20_000),
            });
            if (!q.ok) return;
            const body = await q.json();
            const price = Number(body?.current_price);
            if (Number.isFinite(price) && price > 0) {
              const frontendReceivedAt = Date.now();
              onTick({
                symbolId,
                price,
                ts: Date.parse(body?.last_updated) || frontendReceivedAt,
                frontendReceivedAt,
                source: body?.source,
                provider: body?.provider,
              });
              onStatus("live");
            }
            return;
          }
          const body = await r.json();
          const price = Number(body?.price);
          if (!Number.isFinite(price) || price <= 0) return;
          const frontendReceivedAt = Date.now();
          const lat = body?.latency ?? {};
          onTick({
            symbolId,
            price,
            ts: Date.parse(body?.last_updated) || frontendReceivedAt,
            volume: body?.volume != null ? Number(body.volume) : undefined,
            providerTs: lat.provider_ts ? Date.parse(lat.provider_ts) : undefined,
            backendSentAt: lat.backend_sent_at ? Date.parse(lat.backend_sent_at) : undefined,
            frontendReceivedAt,
            feedDelayMs: lat.feed_delay_ms != null ? Number(lat.feed_delay_ms) : undefined,
            backendDelayMs: lat.backend_delay_ms != null ? Number(lat.backend_delay_ms) : Date.now() - t0,
            bottleneck: lat.bottleneck,
            source: body?.source,
            provider: body?.provider,
            marketStatus: body?.market_status,
          });
          fails = 0;
          onStatus("live");
        } catch {
          /* health probe handles disconnect UX */
        } finally {
          inFlight = false;
        }
      };

      onStatus("connecting");
      void probeHealth();
      void pullTick();
      healthTimer = setInterval(() => void probeHealth(), 12_000);
      quoteTimer = setInterval(() => void pullTick(), 500);

      return cleanup;
    },
  };
}

/** @deprecated aliases */
export const createBinanceTradeProvider = createBinanceTradeTransport;
export const createFastApiTickProvider = createFastApiTickTransport;
export function createFastApiQuoteProvider(): MarketDataTransport {
  return createFastApiTickTransport();
}
