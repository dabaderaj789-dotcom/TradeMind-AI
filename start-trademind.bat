@echo off
REM TradeMind AI — double-click to start API + chart and open the browser.
REM Your bookmark http://127.0.0.1:5173/ redirects to the Trading Terminal.
cd /d "%~dp0"
node scripts\start-local.mjs
if errorlevel 1 pause
