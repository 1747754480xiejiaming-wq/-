@echo off
setlocal
title Cha Xu Local Test Launcher
cd /d "%~dp0"

echo Starting the Cha Xu local test environment...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-local-integration.ps1" -Seed -InstallDependencies -OpenBrowser
if errorlevel 1 (
  echo.
  echo Startup failed. See the message above and try again.
  pause
  exit /b 1
)

echo.
echo Startup complete. The website is open in your default browser.
echo You can close this window; both servers will keep running.
ping.exe -n 4 127.0.0.1 >nul
exit /b 0
