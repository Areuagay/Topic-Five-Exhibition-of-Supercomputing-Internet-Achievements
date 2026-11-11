@echo off
cd /d "%~dp0"
title topic5-backend
node backend\server.js
echo.
echo [backend stopped] press any key to close
pause >nul
