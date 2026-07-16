@echo off
REM TradeMind AI - one-command launcher (Windows) — LAN / iPhone ready
setlocal EnableExtensions

where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js is not installed or not on PATH.
  echo         Install Node.js 18+ from https://nodejs.org and re-run this script.
  pause
  exit /b 1
)

REM Optional force LAN IP for iPhone URLs / Vite HMR:
REM   set TRADEMIND_HOST=192.168.0.133

cd /d "%~dp0"
echo.
echo  TradeMind AI — FastAPI + PostgreSQL (Docker)
echo  Terminal talks only to FastAPI — no demo-server.
echo.
node "%~dp0launch.mjs" %*
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [error] Launcher exited with code %EXITCODE%.
  pause
)
endlocal & exit /b %EXITCODE%
