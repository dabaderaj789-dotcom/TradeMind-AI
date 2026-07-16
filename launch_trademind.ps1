# TradeMind AI - one-command local launcher (PowerShell) — LAN / iPhone ready
# Optional: $env:TRADEMIND_HOST = "192.168.0.133"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[error] Node.js is not installed or not on PATH." -ForegroundColor Red
  Write-Host "        Install Node.js 18+ from https://nodejs.org and re-run this script."
  exit 1
}
Write-Host "TradeMind AI — Wi-Fi ready. Open the LAN URL on your iPhone (not localhost)." -ForegroundColor Cyan
node "$PSScriptRoot\launch.mjs" @args
