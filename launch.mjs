#!/usr/bin/env node
// TradeMind AI — official local launcher (FastAPI + PostgreSQL only).
//
// Runtime:
//   React Terminal / Replay Studio  →  FastAPI  →  PostgreSQL  →  market adapters
//
// Does NOT start demo-server.
//
// Requirements: Docker Desktop (Postgres + FastAPI), Node.js 18+

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { BIND_HOST, detectLanHost, listLanIpv4 } from "./scripts/lan-host.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const IS_WIN = platform() === "win32";
const LOG_DIR = join(ROOT, "logs");
const PREFERRED_LAN = "192.168.0.133";
const PORTS = { api: 8000, terminal: 5175, studio: 5173 };

const children = [];
let shuttingDown = false;

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};
const log = (msg) => console.log(`${C.cyan}[launch]${C.reset} ${msg}`);
const ok = (msg) => console.log(`${C.green}[ ok  ]${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}[warn ]${C.reset} ${msg}`);
const err = (msg) => console.log(`${C.red}[error]${C.reset} ${msg}`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(command, args, { cwd, name, env, shell } = {}) {
  mkdirSync(LOG_DIR, { recursive: true });
  const out = createWriteStream(join(LOG_DIR, `${name}.log`), { flags: "a" });
  out.write(`\n===== ${new Date().toISOString()} : ${command} ${args.join(" ")} =====\n`);
  const child = spawn(command, args, {
    cwd: cwd ?? ROOT,
    env: { ...process.env, ...env },
    shell: shell ?? false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child._name = name;
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      err(`${name} exited with code ${code} — see ${join("logs", name + ".log")}`);
    }
  });
  return child;
}

function runToCompletion(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = run(command, args, opts);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${opts.name} failed (code ${code})`))));
    child.on("error", reject);
  });
}

function killAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${C.cyan}[launch]${C.reset} Shutting down TradeMind AI…`);
  for (const child of children) {
    try {
      if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      else child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  // Leave docker compose running unless TRADEMIND_STOP_DOCKER=1
  if (process.env.TRADEMIND_STOP_DOCKER === "1") {
    spawnSync("docker", ["compose", "stop"], { cwd: ROOT, shell: true, windowsHide: true });
  }
  process.exit(0);
}

async function waitForHttp(url, { label, timeoutMs = 120000, wantJson = false } = {}) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt += 1;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        if (wantJson) {
          const body = await res.json();
          if (body?.status === "healthy" || body?.status === "ok" || body?.status) {
            ok(`${label} is healthy (${url})`);
            return true;
          }
        } else {
          ok(`${label} is serving (${url})`);
          return true;
        }
      }
    } catch {
      /* retry */
    }
    if (attempt === 1 || attempt % 5 === 0) {
      log(`waiting for ${label}… (${Math.round((Date.now() - start) / 1000)}s)`);
    }
    await sleep(2000);
  }
  return false;
}

function openBrowser(url) {
  try {
    if (IS_WIN) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (platform() === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    warn(`Open manually: ${url}`);
  }
}

async function ensureDeps(dir, name) {
  if (existsSync(join(ROOT, dir, "node_modules"))) {
    ok(`${name} dependencies present`);
    return;
  }
  log(`Installing ${name} dependencies…`);
  await runToCompletion("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: join(ROOT, dir),
    name: `install-${name}`,
    shell: true,
  });
  ok(`${name} dependencies installed`);
}

function ensureDocker() {
  const v = spawnSync("docker", ["version"], { encoding: "utf8", shell: true, windowsHide: true });
  if (v.status !== 0) {
    err("Docker is required for FastAPI + PostgreSQL.");
    err("Install Docker Desktop: https://www.docker.com/products/docker-desktop/");
    process.exit(1);
  }
  ok("Docker available");
}

function ensureEnvFile() {
  const envPath = join(ROOT, ".env");
  const example = join(ROOT, ".env.example");
  if (!existsSync(envPath) && existsSync(example)) {
    copyFileSync(example, envPath);
    ok("Created .env from .env.example");
  }
}

async function startFastApiStack() {
  log("Starting PostgreSQL + FastAPI via Docker Compose…");
  // Build + up detached so Ctrl+C only stops Node frontends by default
  const up = spawnSync(
    "docker",
    ["compose", "up", "-d", "--build"],
    { cwd: ROOT, encoding: "utf8", shell: true, windowsHide: true },
  );
  if (up.status !== 0) {
    err("docker compose up failed:");
    console.log(up.stderr || up.stdout);
    process.exit(1);
  }
  ok("Docker Compose services started");
}

async function apiJson(path, { method = "GET", body } = {}) {
  const res = await fetch(`http://127.0.0.1:${PORTS.api}/api/v1${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return data;
}

async function findSymbol(exchange, code) {
  const data = await apiJson(
    `/symbols?exchange_code=${encodeURIComponent(exchange)}&search=${encodeURIComponent(code)}&page_size=100&active_only=true`,
  );
  const hit = (data.items ?? []).find((s) => String(s.symbol_code).toUpperCase() === code.toUpperCase());
  return hit?.id ?? null;
}

const ANALYSIS_PLUGINS = [
  "ema",
  "sma",
  "vwap",
  "rsi",
  "macd",
  "atr",
  "market_structure",
  "order_blocks",
  "fair_value_gaps",
  "liquidity_sweeps",
].map((plugin_id) => ({ plugin_id }));

const STRATEGIES = ["trend_continuation", "pullback", "breakout", "reversal", "range_rejection"];
const TIMEFRAMES = ["15m", "1h", "1d"];

async function bootstrapViaApi() {
  log("Bootstrapping markets on FastAPI (sync → candles → engines)…");
  try {
    await apiJson("/symbols/sync", { method: "POST", body: { exchange_code: "binance" } });
    ok("Binance symbols synced");
  } catch (e) {
    warn(`Symbol sync: ${e.message}`);
  }

  const core = [
    ["binance", "BTCUSDT"],
    ["binance", "ETHUSDT"],
    ["binance", "SOLUSDT"],
  ];

  for (const [exchange, code] of core) {
    let sid;
    try {
      sid = await findSymbol(exchange, code);
    } catch (e) {
      warn(`${code}: lookup failed — ${e.message}`);
      continue;
    }
    if (!sid) {
      warn(`${code}: not found after sync`);
      continue;
    }
    log(`Pipeline ${code}…`);
    for (const tf of TIMEFRAMES) {
      try {
        await apiJson("/candles/download", {
          method: "POST",
          body: { symbol_id: sid, timeframe: tf, incremental: true },
        });
        await apiJson("/analysis/execute", {
          method: "POST",
          body: { symbol_id: sid, timeframe: tf, plugins: ANALYSIS_PLUGINS, candle_limit: 800, persist: true },
        });
        for (const [path, body] of [
          ["/market-structure/execute", { symbol_id: sid, timeframe: tf, persist: true }],
          ["/order-blocks/execute", { symbol_id: sid, timeframe: tf, persist: true }],
          ["/fair-value-gaps/execute", { symbol_id: sid, timeframe: tf, persist: true }],
          ["/liquidity-sweeps/execute", { symbol_id: sid, timeframe: tf, persist: true }],
          ["/trade-setups/execute", { symbol_id: sid, timeframe: tf, ensure_analysis: true, incremental: false }],
        ]) {
          try {
            await apiJson(path, { method: "POST", body });
          } catch (e) {
            warn(`${code} ${path}: ${e.message}`);
          }
        }
        for (const strategy_id of STRATEGIES) {
          try {
            await apiJson("/strategies/execute", {
              method: "POST",
              body: { symbol_id: sid, timeframe: tf, strategy_id, setup_status: "active" },
            });
          } catch {
            /* strategy may reject with no setups */
          }
        }
      } catch (e) {
        warn(`${code} ${tf}: ${e.message}`);
      }
    }
    try {
      const quote = await apiJson(`/quotes/${sid}`);
      ok(`${code}: quote ${quote.current_price} (${quote.provider})`);
    } catch (e) {
      warn(`${code} quote: ${e.message}`);
    }
  }
  ok("Bootstrap finished");
}

function ensureWindowsFirewall(lanHost) {
  if (!IS_WIN) return { messages: [`Open TCP ${PORTS.api}, ${PORTS.terminal}, ${PORTS.studio} on your firewall.`] };
  const messages = [];
  const rules = [
    { name: "TradeMind AI FastAPI", port: PORTS.api },
    { name: "TradeMind AI Trading Terminal", port: PORTS.terminal },
    { name: "TradeMind AI Replay Studio", port: PORTS.studio },
  ];
  for (const r of rules) {
    const shown = spawnSync("netsh", ["advfirewall", "firewall", "show", "rule", `name=${r.name}`], {
      encoding: "utf8",
      windowsHide: true,
    });
    const exists = shown.status === 0 && /Enabled:\s*Yes/i.test(shown.stdout || "");
    if (exists) {
      messages.push(`Firewall rule OK: ${r.name} (TCP ${r.port})`);
      continue;
    }
    const added = spawnSync(
      "netsh",
      [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${r.name}`,
        "dir=in",
        "action=allow",
        "protocol=TCP",
        `localport=${r.port}`,
        "profile=private,domain",
        "enable=yes",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    messages.push(
      added.status === 0
        ? `Created firewall rule: ${r.name}`
        : `Could not create firewall rule for TCP ${r.port} (run as Admin if needed)`,
    );
  }
  messages.push(`LAN host for iPhone: ${lanHost}`);
  return { messages };
}

async function main() {
  const lanHost = detectLanHost(PREFERRED_LAN);
  const ifaces = listLanIpv4();
  const urls = {
    terminal: `http://${lanHost}:${PORTS.terminal}`,
    studio: `http://${lanHost}:${PORTS.studio}/studio/`,
    api: `http://${lanHost}:${PORTS.api}/api/v1/health`,
    apiLocal: `http://127.0.0.1:${PORTS.api}/api/v1/health`,
    terminalLocal: `http://127.0.0.1:${PORTS.terminal}`,
    studioLocal: `http://127.0.0.1:${PORTS.studio}/studio/`,
  };

  console.log("");
  console.log(`${C.bold}${C.cyan}  TradeMind AI — FastAPI Launcher${C.reset}`);
  console.log(`${C.dim}  Terminal → FastAPI → PostgreSQL · no demo-server${C.reset}`);
  console.log("");
  log(`Detected LAN IP: ${C.bold}${lanHost}${C.reset}`);
  if (ifaces.length) log(`Interfaces: ${ifaces.map((i) => `${i.address} (${i.name})`).join(", ")}`);

  ensureDocker();
  ensureEnvFile();
  await ensureDeps("terminal", "Trading Terminal");
  await ensureDeps("studio", "Replay Studio");

  // Skip compose if API already healthy (re-run bootstrap only)
  let apiUp = false;
  try {
    const res = await fetch(urls.apiLocal, { signal: AbortSignal.timeout(3000) });
    apiUp = res.ok;
  } catch {
    apiUp = false;
  }

  if (!apiUp) {
    await startFastApiStack();
  } else {
    ok("FastAPI already healthy — reusing");
  }

  const apiHealthy = await waitForHttp(urls.apiLocal, {
    label: "FastAPI",
    timeoutMs: 180000,
    wantJson: true,
  });
  if (!apiHealthy) {
    err("FastAPI did not become healthy. Check: docker compose logs api");
    process.exit(1);
  }

  if (process.env.TRADEMIND_SKIP_BOOTSTRAP !== "1") {
    await bootstrapViaApi();
  } else {
    warn("Skipped bootstrap (TRADEMIND_SKIP_BOOTSTRAP=1)");
  }

  const viteEnv = {
    VITE_API_TARGET: `http://127.0.0.1:${PORTS.api}`,
    VITE_DEV_HOST: lanHost,
  };

  log(`Starting Trading Terminal on ${BIND_HOST}:${PORTS.terminal}…`);
  run("npm", ["run", "dev", "--", "--host", "0.0.0.0", "--port", String(PORTS.terminal), "--strictPort"], {
    cwd: join(ROOT, "terminal"),
    name: "terminal",
    shell: true,
    env: viteEnv,
  });

  log(`Starting Replay Studio on ${BIND_HOST}:${PORTS.studio}…`);
  run("npm", ["run", "dev", "--", "--host", "0.0.0.0", "--port", String(PORTS.studio), "--strictPort"], {
    cwd: join(ROOT, "studio"),
    name: "studio",
    shell: true,
    env: viteEnv,
  });

  const [termUp, studioUp] = await Promise.all([
    waitForHttp(urls.terminalLocal, { label: "Trading Terminal", timeoutMs: 90000 }),
    waitForHttp(urls.studioLocal, { label: "Replay Studio", timeoutMs: 90000 }),
  ]);

  const fw = ensureWindowsFirewall(lanHost);
  for (const m of fw.messages) {
    if (m.includes("Could not")) warn(m);
    else ok(m);
  }

  if (termUp) openBrowser(urls.terminal);
  if (studioUp) openBrowser(urls.studio);

  console.log("");
  console.log(`${C.green}${C.bold}  TradeMind AI (FastAPI) is running.${C.reset}`);
  console.log("");
  console.log(`  ${C.bold}Trading Terminal${C.reset}   ${C.cyan}${urls.terminal}${C.reset}`);
  console.log(`  ${C.bold}Replay Studio${C.reset}      ${C.cyan}${urls.studio}${C.reset}`);
  console.log(`  ${C.bold}API health${C.reset}         ${urls.api}`);
  console.log(`  ${C.bold}API docs${C.reset}           http://127.0.0.1:${PORTS.api}/docs`);
  console.log("");
  console.log(`  ${C.bold}Session login${C.reset}     demo@trademind.ai  /  demo123`);
  console.log(`  ${C.dim}(Local UI gate only — FastAPI has no JWT auth yet.)${C.reset}`);
  console.log("");
  console.log(`  ${C.dim}Logs: ./logs   •   Ctrl+C stops frontends.`);
  console.log(`  ${C.dim}Stop API+DB: set TRADEMIND_STOP_DOCKER=1 before Ctrl+C, or: docker compose stop${C.reset}`);
  console.log("");
}

process.on("SIGINT", killAll);
process.on("SIGTERM", killAll);

main().catch((e) => {
  err(String(e?.stack ?? e));
  killAll();
});
