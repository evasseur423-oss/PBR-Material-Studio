@echo off
chcp 65001 >nul
title PBR Material Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez ce script.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installation des dependances ^(premier lancement^)...
  call npm.cmd install --no-audit --no-fund
  if not exist "node_modules\electron\dist\electron.exe" (
    if exist "node_modules\electron\install.js" (
      node "node_modules\electron\install.js"
    )
  )
)

start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
