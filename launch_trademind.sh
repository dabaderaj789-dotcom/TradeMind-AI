#!/usr/bin/env bash
# TradeMind AI - one-command local launcher (macOS / Linux)
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "[error] Node.js is not installed or not on PATH."
  echo "        Install Node.js 18+ from https://nodejs.org and re-run this script."
  exit 1
fi
exec node launch.mjs "$@"
