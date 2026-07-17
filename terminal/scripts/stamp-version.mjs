#!/usr/bin/env node
/** Writes public/version.json at build time so the deployed bundle self-identifies its source commit. */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const commit =
  process.env.VERCEL_GIT_COMMIT_SHA || git("rev-parse HEAD") || "unknown";

const payload = {
  commit,
  short: commit.slice(0, 7),
  builtAt: new Date().toISOString(),
};

const out = join(root, "public", "version.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
console.log(`[stamp-version] ${payload.short} @ ${payload.builtAt}`);
