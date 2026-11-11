@echo off
chcp 65001 >nul
setlocal
title Topic5 Local Demo
cd /d "%~dp0"

echo ============================================
echo   Topic5 Exhibition - local demo launcher
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo         Install Node.js 18+ first: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "frontend\node_modules\nuxt" (
  echo [1/3] First run: installing frontend dependencies...
  echo       This takes 1-3 minutes, do not close this window.
  echo.
  pushd frontend
  call "C:\Program Files\nodejs\npm.cmd" ci --registry=https://registry.npmmirror.com --no-audit --no-fund
  popd
  echo.
) else (
  echo [1/3] Dependencies already installed, skipping.
)

echo [2/3] Starting backend ...
start "topic5-backend" "%~dp0run-backend.cmd"

echo [3/3] Starting frontend ...
start "topic5-frontend" "%~dp0run-frontend.cmd"

echo.
echo Waiting about 30 seconds for the dev server to boot...
ping -n 31 127.0.0.1 >nul

echo.
echo --------------------------------------------
echo  Open in browser: http://localhost:3000
echo  Backend health : http://localhost:3001/api/v1/index
echo.
echo  First load may show a 504 error once: that
echo  is Vite optimizing dependencies. Wait for
echo  "optimized dependencies changed" in the
echo  frontend window, then press F5.
echo.
echo  To stop: close the two server windows,
echo           or double-click stop-local.cmd
echo --------------------------------------------
echo.
pause
