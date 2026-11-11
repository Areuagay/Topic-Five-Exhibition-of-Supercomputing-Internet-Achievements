@echo off
chcp 65001 >nul
setlocal
title Topic5 - stop local servers

echo Stopping services on ports 3000 and 3001 ...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr LISTENING ^| findstr ":3000 "') do (
  taskkill /f /pid %%a >nul 2>nul
  echo   killed pid %%a on port 3000
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr LISTENING ^| findstr ":3001 "') do (
  taskkill /f /pid %%a >nul 2>nul
  echo   killed pid %%a on port 3001
)

echo.
echo Done. You can also just close the two server windows.
pause
