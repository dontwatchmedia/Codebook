@echo off
cd /d "%~dp0"
if exist "CodeBook.exe" (
  start "" "%~dp0CodeBook.exe"
) else (
  echo Build CodeBook first with:
  echo powershell -ExecutionPolicy Bypass -File scripts\desktop.ps1 build
  echo powershell -ExecutionPolicy Bypass -File scripts\package.ps1
  pause
)
