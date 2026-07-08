@echo off
REM METARDU Startup Script — runs dev server and bore tunnel
REM Run this from the METARDU folder in a terminal.
REM Or double-click to open in two new windows.

echo [METARDU] Starting Next.js dev server on port 3000...
start "METARDU Dev Server" cmd /k "cd /d %~dp0 && npm run dev"

echo [METARDU] Waiting for server to start (20s)...
timeout /t 20 /nobreak > nul

echo [METARDU] Starting bore tunnel on port 3000...
start "METARDU Bore Tunnel" cmd /k "C:\Users\user\.cargo\bin\bore.exe local 3000"

echo [METARDU] Done. Check the "METARDU Bore Tunnel" window for your public URL.
pause