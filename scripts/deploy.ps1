# Sun Pharma Video Platform - Deployment Script
# This script deploys the latest code from local to the GCP VM

param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$NoBuild,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ID = "sage-shard-448708-v9"
$ZONE = "asia-south1-a"
$INSTANCE_NAME = "sunpharma-video-platform"
$REMOTE_PATH = "/opt/sunpharma"
$LOCAL_PATH = $PSScriptRoot | Split-Path -Parent

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Sun Pharma Video Platform - Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($Help) {
    Write-Host "Usage: .\deploy.ps1 [-BackendOnly] [-FrontendOnly] [-NoBuild] [-Help]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -BackendOnly   Deploy only backend changes"
    Write-Host "  -FrontendOnly  Deploy only frontend changes"
    Write-Host "  -NoBuild       Skip local build step"
    Write-Host "  -Help          Show this help message"
    exit 0
}

# Function to run gcloud commands
function Invoke-GCloud {
    param([string]$Command)
    $fullCommand = "gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --command=`"$Command`""
    Write-Host "  > $Command" -ForegroundColor Gray
    Invoke-Expression $fullCommand
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Command"
    }
}

# Function to copy files to VM
function Copy-ToVM {
    param(
        [string]$LocalPath,
        [string]$RemotePath
    )
    Write-Host "  Copying: $LocalPath -> $RemotePath" -ForegroundColor Gray
    gcloud compute scp --recurse $LocalPath "${INSTANCE_NAME}:${RemotePath}" --zone=$ZONE --project=$PROJECT_ID
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to copy: $LocalPath"
    }
}

# Step 1: Build frontend locally (if not skipped)
if (-not $NoBuild -and -not $BackendOnly) {
    Write-Host ""
    Write-Host "[1/4] Building frontend locally..." -ForegroundColor Yellow
    Push-Location "$LOCAL_PATH\frontend"
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        throw "Frontend build failed"
    }
    Pop-Location
    Write-Host "  ✓ Frontend built successfully" -ForegroundColor Green
} else {
    Write-Host "[1/4] Skipping frontend build" -ForegroundColor Gray
}

# Step 2: Upload changed files
Write-Host ""
Write-Host "[2/4] Uploading files to VM..." -ForegroundColor Yellow

if (-not $FrontendOnly) {
    Write-Host "  Uploading backend files..."
    Copy-ToVM "$LOCAL_PATH\backend\routes" "$REMOTE_PATH\backend\"
    Copy-ToVM "$LOCAL_PATH\backend\services" "$REMOTE_PATH\backend\"
    Copy-ToVM "$LOCAL_PATH\backend\utils" "$REMOTE_PATH\backend\"
    Copy-ToVM "$LOCAL_PATH\backend\db" "$REMOTE_PATH\backend\"
    Copy-ToVM "$LOCAL_PATH\backend\server.js" "$REMOTE_PATH\backend\"
    Copy-ToVM "$LOCAL_PATH\backend\package.json" "$REMOTE_PATH\backend\"
    Write-Host "  ✓ Backend files uploaded" -ForegroundColor Green
}

if (-not $BackendOnly) {
    Write-Host "  Uploading frontend files..."
    Copy-ToVM "$LOCAL_PATH\frontend\src" "$REMOTE_PATH\frontend\"
    Copy-ToVM "$LOCAL_PATH\frontend\nginx.conf" "$REMOTE_PATH\frontend\"
    Copy-ToVM "$LOCAL_PATH\frontend\package.json" "$REMOTE_PATH\frontend\"
    Copy-ToVM "$LOCAL_PATH\frontend\index.html" "$REMOTE_PATH\frontend\"
    Copy-ToVM "$LOCAL_PATH\frontend\vite.config.js" "$REMOTE_PATH\frontend\"
    Copy-ToVM "$LOCAL_PATH\frontend\tailwind.config.js" "$REMOTE_PATH\frontend\"
    Copy-ToVM "$LOCAL_PATH\frontend\postcss.config.js" "$REMOTE_PATH\frontend\"
    Write-Host "  ✓ Frontend files uploaded" -ForegroundColor Green
}

# Step 3: Rebuild and restart containers
Write-Host ""
Write-Host "[3/4] Rebuilding Docker containers..." -ForegroundColor Yellow

if (-not $FrontendOnly) {
    Write-Host "  Rebuilding backend..."
    Invoke-GCloud "cd $REMOTE_PATH && sudo docker compose build --no-cache backend"
    Write-Host "  ✓ Backend rebuilt" -ForegroundColor Green
}

if (-not $BackendOnly) {
    Write-Host "  Rebuilding frontend..."
    Invoke-GCloud "cd $REMOTE_PATH && sudo docker compose build --no-cache frontend"
    Write-Host "  ✓ Frontend rebuilt" -ForegroundColor Green
}

# Step 4: Restart containers
Write-Host ""
Write-Host "[4/4] Restarting containers..." -ForegroundColor Yellow

if ($BackendOnly) {
    Invoke-GCloud "cd $REMOTE_PATH && sudo docker compose up -d backend"
} elseif ($FrontendOnly) {
    Invoke-GCloud "cd $REMOTE_PATH && sudo docker compose up -d frontend"
} else {
    Invoke-GCloud "cd $REMOTE_PATH && sudo docker compose up -d"
}

Write-Host "  ✓ Containers restarted" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Website: https://sustencap.gonuts.ai" -ForegroundColor Cyan
Write-Host "Admin:   https://sustencap.gonuts.ai/admin" -ForegroundColor Cyan
Write-Host ""
