/**
 * Detect a usable LAN IPv4 address for phone / Wi-Fi access.
 * Prefer TRADEMIND_HOST env, then a preferred hint, then private-range interfaces.
 */
import { networkInterfaces } from "node:os";

const PRIVATE_SCORE = (ip) => {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
  return 9;
};

export function listLanIpv4() {
  const nets = networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      const family = typeof net.family === "string" ? net.family : String(net.family);
      if ((family === "IPv4" || family === "4") && !net.internal) {
        out.push({ name, address: net.address });
      }
    }
  }
  return out.sort((a, b) => PRIVATE_SCORE(a.address) - PRIVATE_SCORE(b.address));
}

/**
 * @param {string | undefined} preferred  Hint (e.g. 192.168.0.133)
 */
export function detectLanHost(preferred) {
  const override = (process.env.TRADEMIND_HOST || "").trim();
  if (override) return override;

  const addrs = listLanIpv4().map((x) => x.address);
  if (preferred && addrs.includes(preferred)) return preferred;
  if (addrs.length) return addrs[0];
  return preferred || "127.0.0.1";
}

export const BIND_HOST = "0.0.0.0";
