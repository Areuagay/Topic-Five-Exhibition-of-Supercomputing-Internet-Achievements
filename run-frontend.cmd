@echo off
cd /d "%~dp0frontend"
title topic5-frontend
node node_modules\nuxt\bin\nuxt.mjs dev --port 3000
echo.
echo [frontend stopped] press any key to close
pause >nul
