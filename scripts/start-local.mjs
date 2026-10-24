#!/usr/bin/env node
/**
 * One-shot local stack: FastAPI + Trading Terminal (+ 5173→5175 redirect).
 * Usage: node scripts/start-local.mjs
 * Or double-click start-trademind.bat
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = platform() === "win32";
const API_PORT = 8000;
const TERMINAL_PORT = 5175;
const BOOKMARK_PORT = 5173;
const OPEN_URL = `http://127.0.0.1:${BOOKMARK_PORT}/`;

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

function run(name, command, args, { cwd, env } = {}) {
  console.log(`[start] ${name}`);
  const child = spawn(command, args, {
    cwd: cwd ?? ROOT,
    env: { ...process.env, ...env },
    shell: IS_WIN,
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  });
  child.unref();
  return child;
}

function openBrowser(url) {
  if (IS_WIN) {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function waitFor(port, label, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    const free = await portFree(port);
    if (!free) {
      console.log(`[ ok  ] ${label} on :${port}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[error] ${label} did not start on :${port}`);
  return false;
}

async function main() {
  const fileEnv = loadEnvFile(join(ROOT, ".env.local.api"));
  const cors = [
    "http://127.0.0.1:5175",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://192.168.0.132:5175",
  ].join(",");

  if (await portFree(API_PORT)) {
    run("API", "python", ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", String(API_PORT)], {
      env: {
        ...fileEnv,
        PYTHONPATH: ROOT,
        CORS_ORIGINS: cors,
      },
    });
  } else {
    console.log(`[skip ] API already on :${API_PORT}`);
  }

  if (await portFree(TERMINAL_PORT)) {
    run("Terminal", "npm", ["run", "dev"], {
      cwd: join(ROOT, "terminal"),
      env: { VITE_API_TARGET: "http://127.0.0.1:8000" },
    });
  } else {
    console.log(`[skip ] Terminal already on :${TERMINAL_PORT}`);
  }

  if (await portFree(BOOKMARK_PORT)) {
    run("5173-redirect", "node", [join(ROOT, "scripts", "redirect-5173.mjs")]);
  } else {
    console.log(`[skip ] :${BOOKMARK_PORT} already in use`);
  }

  await waitFor(API_PORT, "API");
  await waitFor(TERMINAL_PORT, "Terminal");
  await waitFor(BOOKMARK_PORT, "Bookmark redirect");

  openBrowser(OPEN_URL);
  console.log(`[done] Open ${OPEN_URL} (terminal is :${TERMINAL_PORT})`);
  // Exit; children keep running detached.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
