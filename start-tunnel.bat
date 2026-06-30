@echo off
title METARDU Cloudflare Tunnel
echo ==========================================
echo   METARDU - Starting Cloudflare Quick Tunnel
echo ==========================================
echo.
echo Stopping any existing cloudflared processes...
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting tunnel (pointing to http://127.0.0.1:3000)...
echo.
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000 --loglevel info 2>"C:\Users\user\Desktop\METARDU\cloudflared-err.log"

echo.
echo Tunnel has stopped.
pause
