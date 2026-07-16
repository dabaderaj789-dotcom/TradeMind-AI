#!/usr/bin/env node
/**
 * Local verification that TradeMind is ready for free-cloud deploy.
 * Does not call Vercel/Railway — validates builds, API health, and CORS.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_API = "https://trademind-api-example.onrender.com/api/v1";
const ORIGIN = "https://trademind-terminal.vercel.app";

function run(cmd, args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
      stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → ${code}`))));
  });
}

function request(opts) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  console.log("\n  TradeMind — cloud readiness check\n");

  const terminalPkg = path.join(root, "terminal", "package.json");
  const studioPkg = path.join(root, "studio", "package.json");
  const demoPkg = path.join(root, "demo-server", "package.json");
  for (const p of [terminalPkg, studioPkg, demoPkg]) {
    if (!existsSync(p)) throw new Error(`Missing ${p}`);
  }
  console.log("[ ok  ] Deploy package manifests present");

  console.log("[build] Trading Terminal (VITE_API_BASE set)…");
  await run("npm", ["run", "build"], path.join(root, "terminal"), {
    VITE_API_BASE: FAKE_API,
  });
  if (!existsSync(path.join(root, "terminal", "dist", "index.html"))) {
    throw new Error("terminal/dist/index.html missing");
  }
  console.log("[ ok  ] terminal/dist built");

  console.log("[build] Replay Studio (VITE_API_BASE + VITE_BASE=/)…");
  await run("npm", ["run", "build"], path.join(root, "studio"), {
    VITE_API_BASE: FAKE_API,
    VITE_BASE: "/",
  });
  if (!existsSync(path.join(root, "studio", "dist", "index.html"))) {
    throw new Error("studio/dist/index.html missing");
  }
  console.log("[ ok  ] studio/dist built");

  const api = spawn("node", ["server.mjs"], {
    cwd: path.join(root, "demo-server"),
    env: {
      ...process.env,
      PORT: "8010",
      CORS_ORIGINS: ORIGIN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((r) => setTimeout(r, 800));

  try {
    const health = await request({
      hostname: "127.0.0.1",
      port: 8010,
      path: "/api/v1/health",
      method: "GET",
    });
    if (health.status !== 200 || !health.body.includes("healthy")) {
      throw new Error(`Health failed: ${health.status} ${health.body}`);
    }
    console.log("[ ok  ] Demo API /api/v1/health");

    const preflight = await request({
      hostname: "127.0.0.1",
      port: 8010,
      path: "/api/v1/health",
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "GET",
      },
    });
    const allow = preflight.headers["access-control-allow-origin"];
    if (allow !== ORIGIN && allow !== "*") {
      throw new Error(`CORS missing for ${ORIGIN}, got ${allow}`);
    }
    console.log(`[ ok  ] CORS allows ${ORIGIN}`);

    const symbols = await request({
      hostname: "127.0.0.1",
      port: 8010,
      path: "/api/v1/symbols?page_size=5",
      method: "GET",
      headers: { Origin: ORIGIN },
    });
    if (symbols.status !== 200) throw new Error("symbols failed");
    console.log("[ ok  ] Symbols endpoint reachable");
  } finally {
    api.kill();
  }

  console.log(`
  Ready for cloud deploy.
  Next: follow DEPLOY.md (Render/Railway API → Vercel Terminal + Studio).
`);
}

main().catch((err) => {
  console.error("\n[fail]", err.message || err);
  process.exit(1);
});
