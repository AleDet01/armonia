@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Armonia richiede Node.js 24 o superiore.
  echo Installa Node.js e riapri questo file.
  pause
  exit /b 1
)

node -e "const m=Number(process.versions.node.split('.')[0]); process.exit(m>=24?0:1)"
if errorlevel 1 (
  echo Armonia richiede Node.js 24 o superiore.
  node --version
  pause
  exit /b 1
)

echo Avvio Armonia...
node --experimental-strip-types src\cli.ts ui
if errorlevel 1 pause
