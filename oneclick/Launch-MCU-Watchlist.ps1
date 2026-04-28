$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "Starting MCU Watchlist from: $projectRoot"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed. Install Node.js LTS, then run this launcher again."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is not available. Reinstall Node.js LTS, then run this launcher again."
}

if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
  Write-Host "Dependencies not found. Running npm install..."
  npm install
}

$backendCommand = "cd `"$projectRoot`"; npm run dev:backend"
$frontendCommand = "cd `"$projectRoot`"; npm run dev:frontend"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null
Start-Sleep -Seconds 4

Start-Process "http://localhost:5173"

Write-Host "MCU Watchlist launched."
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend: http://localhost:4000"
