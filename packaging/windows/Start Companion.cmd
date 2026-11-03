@echo off
setlocal
if /I "%~1"=="--debug" set "BRIGHTSPACE_LOG_LEVEL=debug"
title Brightspace Context Companion
cd /d "%~dp0app" || exit /b 1
"%~dp0runtime\node.exe" "companion\start.js"
if errorlevel 1 (
  echo.
  echo The companion could not start. Another copy may already be running.
  echo Close its window before starting a second copy.
  pause
)
