# ================================================
# Sun Pharma Video Platform - Complete GCP Setup
# ================================================
# This script sets up:
# 1. GCS Buckets for storing uploads (images, audio, generated content)
# 2. VM Instance with static external IP
# 3. Firewall rules for HTTP/HTTPS access
# ================================================

param(
    [string]$ProjectId = "",
    [string]$Region = "asia-south1",
    [string]$Zone = "asia-south1-a",
    [string]$VMName = "sunpharma-video-platform",
    [string]$MachineType = "e2-standard-2",
    [string]$BucketPrefix = "sunpharma-video"
)

# Colors for output
function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host $msg -ForegroundColor Red }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Sun Pharma Video Platform - GCP Infrastructure Setup     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ================================================
# Step 1: Check Prerequisites
# ================================================
Write-Info "📋 Step 1: Checking prerequisites..."

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Err "❌ Error: gcloud CLI is not installed."
    Write-Warn "Please install from: https://cloud.google.com/sdk/docs/install"
    exit 1
}
Write-Success "  ✅ gcloud CLI found"

# Check authentication
$authAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $authAccount) {
    Write-Warn "⚠️ Not authenticated. Starting login..."
    gcloud auth login
    $authAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
}
Write-Success "  ✅ Authenticated as: $authAccount"

# ================================================
# Step 2: Set Project
# ================================================
Write-Info "`n📋 Step 2: Setting up project..."

if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Warn "No project set. Available projects:"
        gcloud projects list --format="table(projectId,name)"
        $ProjectId = Read-Host "Enter your GCP Project ID"
    }
}

gcloud config set project $ProjectId 2>$null
Write-Success "  ✅ Using project: $ProjectId"

# Enable required APIs
Write-Info "`n📋 Step 3: Enabling required APIs..."
$apis = @(
    "compute.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com"
)

foreach ($api in $apis) {
    Write-Host "  Enabling $api..." -NoNewline
    gcloud services enable $api --quiet 2>$null
    Write-Success " ✅"
}

# ================================================
# Step 4: Create Storage Buckets
# ================================================
Write-Info "`n📋 Step 4: Creating GCS Buckets..."

$buckets = @{
    "uploads"         = "$BucketPrefix-uploads-$ProjectId"
    "audio-masters"   = "$BucketPrefix-audio-masters-$ProjectId"
    "generated-audio" = "$BucketPrefix-generated-audio-$ProjectId"
    "generated-video" = "$BucketPrefix-generated-video-$ProjectId"
}

$bucketUrls = @{}

foreach ($key in $buckets.Keys) {
    $bucketName = $buckets[$key]
    Write-Host "  Creating bucket: $bucketName..." -NoNewline
    
    # Check if bucket exists
    $exists = gsutil ls -b "gs://$bucketName" 2>$null
    
    if ($exists) {
        Write-Warn " (already exists) ✅"
    } else {
        # Create bucket with location
        gsutil mb -l $Region -c STANDARD "gs://$bucketName" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success " ✅"
        } else {
            Write-Err " ❌ Failed to create bucket"
        }
    }
    
    # Set CORS for web access
    $corsConfig = @"
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "X-Requested-With"],
    "maxAgeSeconds": 3600
  }
]
"@
    $corsFile = [System.IO.Path]::GetTempFileName()
    $corsConfig | Out-File -FilePath $corsFile -Encoding UTF8
    gsutil cors set $corsFile "gs://$bucketName" 2>$null
    Remove-Item $corsFile -Force
    
    # Make bucket uniform access
    gsutil uniformbucketlevelaccess set on "gs://$bucketName" 2>$null
    
    $bucketUrls[$key] = "gs://$bucketName"
}

Write-Success "`n  📦 All buckets created successfully!"

# ================================================
# Step 5: Create Static IP Address
# ================================================
Write-Info "`n📋 Step 5: Reserving static external IP..."

$staticIpName = "$VMName-static-ip"
$existingIp = gcloud compute addresses describe $staticIpName --region=$Region --format="value(address)" 2>$null

if ($existingIp) {
    Write-Success "  ✅ Static IP already exists: $existingIp"
} else {
    gcloud compute addresses create $staticIpName `
        --region=$Region `
        --network-tier=PREMIUM `
        --quiet
    
    $existingIp = gcloud compute addresses describe $staticIpName --region=$Region --format="value(address)" 2>$null
    Write-Success "  ✅ Static IP reserved: $existingIp"
}

$STATIC_IP = $existingIp

# ================================================
# Step 6: Create Firewall Rules
# ================================================
Write-Info "`n📋 Step 6: Creating firewall rules..."

# Allow HTTP
$httpRuleExists = gcloud compute firewall-rules describe allow-http 2>$null
if (-not $httpRuleExists) {
    gcloud compute firewall-rules create allow-http `
        --allow tcp:80 `
        --target-tags=http-server `
        --description="Allow HTTP traffic" `
        --quiet 2>$null
    Write-Success "  ✅ HTTP firewall rule created"
} else {
    Write-Success "  ✅ HTTP firewall rule exists"
}

# Allow HTTPS
$httpsRuleExists = gcloud compute firewall-rules describe allow-https 2>$null
if (-not $httpsRuleExists) {
    gcloud compute firewall-rules create allow-https `
        --allow tcp:443 `
        --target-tags=https-server `
        --description="Allow HTTPS traffic" `
        --quiet 2>$null
    Write-Success "  ✅ HTTPS firewall rule created"
} else {
    Write-Success "  ✅ HTTPS firewall rule exists"
}

# Allow custom ports (3001 for API, 5173 for dev frontend)
$customRuleExists = gcloud compute firewall-rules describe allow-sunpharma-ports 2>$null
if (-not $customRuleExists) {
    gcloud compute firewall-rules create allow-sunpharma-ports `
        --allow tcp:3001,tcp:5173,tcp:8080 `
        --target-tags=sunpharma-server `
        --description="Allow Sun Pharma application ports" `
        --quiet 2>$null
    Write-Success "  ✅ Custom ports firewall rule created"
} else {
    Write-Success "  ✅ Custom ports firewall rule exists"
}

# ================================================
# Step 7: Create VM Instance
# ================================================
Write-Info "`n📋 Step 7: Creating VM instance..."

# Check if VM already exists
$vmExists = gcloud compute instances describe $VMName --zone=$Zone 2>$null

if ($vmExists) {
    Write-Warn "  ⚠️ VM '$VMName' already exists in $Zone"
    $recreate = Read-Host "  Do you want to delete and recreate it? (y/N)"
    if ($recreate -eq 'y' -or $recreate -eq 'Y') {
        Write-Info "  Deleting existing VM..."
        gcloud compute instances delete $VMName --zone=$Zone --quiet
    } else {
        Write-Info "  Keeping existing VM."
        $vmExists = $true
    }
}

if (-not $vmExists -or $recreate -eq 'y' -or $recreate -eq 'Y') {
    # Create startup script
    $startupScript = @'
#!/bin/bash
set -e

# Log startup
exec > >(tee /var/log/startup-script.log) 2>&1
echo "=== Sun Pharma VM Startup Script ==="
echo "Started at: $(date)"

# Update system
apt-get update
apt-get upgrade -y

# Install Docker
apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install nginx
apt-get install -y nginx certbot python3-certbot-nginx

# Create application directory
mkdir -p /opt/sunpharma
mkdir -p /opt/sunpharma/data/uploads/image
mkdir -p /opt/sunpharma/data/uploads/audio
mkdir -p /opt/sunpharma/data/uploads/video
mkdir -p /opt/sunpharma/data/db
chmod -R 755 /opt/sunpharma

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Add default user to docker group
usermod -aG docker $(logname 2>/dev/null || echo "root")

echo "=== Startup script completed at: $(date) ==="
'@

    # Save startup script to temp file
    $startupFile = [System.IO.Path]::GetTempFileName()
    $startupScript | Out-File -FilePath $startupFile -Encoding UTF8

    Write-Info "  Creating VM with static IP: $STATIC_IP"
    
    gcloud compute instances create $VMName `
        --zone=$Zone `
        --machine-type=$MachineType `
        --image-family=ubuntu-2204-lts `
        --image-project=ubuntu-os-cloud `
        --boot-disk-size=100GB `
        --boot-disk-type=pd-balanced `
        --tags=http-server,https-server,sunpharma-server `
        --address=$STATIC_IP `
        --scopes=storage-full,compute-ro `
        --metadata-from-file=startup-script=$startupFile `
        --quiet
    
    Remove-Item $startupFile -Force
    
    Write-Success "  ✅ VM created successfully!"
}

# ================================================
# Step 8: Create Service Account (optional)
# ================================================
Write-Info "`n📋 Step 8: Creating service account..."

$serviceAccountName = "sunpharma-video-sa"
$serviceAccountEmail = "$serviceAccountName@$ProjectId.iam.gserviceaccount.com"

$saExists = gcloud iam service-accounts describe $serviceAccountEmail 2>$null
if (-not $saExists) {
    gcloud iam service-accounts create $serviceAccountName `
        --display-name="Sun Pharma Video Platform Service Account" `
        --quiet
    
    # Grant Storage Admin role
    gcloud projects add-iam-policy-binding $ProjectId `
        --member="serviceAccount:$serviceAccountEmail" `
        --role="roles/storage.admin" `
        --quiet 2>$null
    
    # Grant Compute Viewer role
    gcloud projects add-iam-policy-binding $ProjectId `
        --member="serviceAccount:$serviceAccountEmail" `
        --role="roles/compute.viewer" `
        --quiet 2>$null
    
    Write-Success "  ✅ Service account created: $serviceAccountEmail"
} else {
    Write-Success "  ✅ Service account exists: $serviceAccountEmail"
}

# Create and download key
$keyFile = ".\credentials\$serviceAccountName-key.json"
$keyDir = Split-Path $keyFile
if (-not (Test-Path $keyDir)) {
    New-Item -ItemType Directory -Path $keyDir -Force | Out-Null
}

if (-not (Test-Path $keyFile)) {
    Write-Info "  Generating service account key..."
    gcloud iam service-accounts keys create $keyFile `
        --iam-account=$serviceAccountEmail `
        --quiet
    Write-Success "  ✅ Key saved to: $keyFile"
} else {
    Write-Warn "  ⚠️ Key file already exists: $keyFile"
}

# ================================================
# Summary
# ================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              🎉 GCP Setup Complete!                          ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Info "📦 Storage Buckets Created:"
foreach ($key in $bucketUrls.Keys) {
    Write-Host "   • $($key): " -NoNewline
    Write-Success $bucketUrls[$key]
}

Write-Host ""
Write-Info "🖥️ VM Instance:"
Write-Host "   • Name: $VMName"
Write-Host "   • Zone: $Zone"
Write-Host "   • Machine Type: $MachineType"
Write-Host "   • Static IP: " -NoNewline
Write-Success $STATIC_IP

Write-Host ""
Write-Info "🔐 Service Account:"
Write-Host "   • Email: $serviceAccountEmail"
Write-Host "   • Key File: $keyFile"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Info "📝 Next Steps:"
Write-Host ""
Write-Host "1. SSH into the VM:"
Write-Host "   " -NoNewline
Write-Success "gcloud compute ssh $VMName --zone=$Zone"
Write-Host ""
Write-Host "2. Wait for startup script to complete (check logs):"
Write-Host "   " -NoNewline
Write-Success "sudo tail -f /var/log/startup-script.log"
Write-Host ""
Write-Host "3. Clone your repository:"
Write-Host "   cd /opt/sunpharma"
Write-Host "   git clone <your-repo-url> ."
Write-Host ""
Write-Host "4. Create .env file with these bucket names:"
Write-Host "   GCS_BUCKET_UPLOADS=$($buckets['uploads'])"
Write-Host "   GCS_BUCKET_AUDIO_MASTERS=$($buckets['audio-masters'])"
Write-Host "   GCS_BUCKET_GENERATED_AUDIO=$($buckets['generated-audio'])"
Write-Host "   GCS_BUCKET_GENERATED_VIDEO=$($buckets['generated-video'])"
Write-Host ""
Write-Host "5. Start the application:"
Write-Host "   docker compose up -d --build"
Write-Host ""
Write-Host "6. Access the application:"
Write-Host "   " -NoNewline
Write-Success "http://$STATIC_IP"
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow

# Save configuration to file
$configOutput = @"
# Sun Pharma Video Platform - GCP Configuration
# Generated on: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Project
GCP_PROJECT_ID=$ProjectId
GCP_REGION=$Region
GCP_ZONE=$Zone

# VM Instance
VM_NAME=$VMName
VM_STATIC_IP=$STATIC_IP
VM_MACHINE_TYPE=$MachineType

# Storage Buckets
GCS_BUCKET_UPLOADS=$($buckets['uploads'])
GCS_BUCKET_AUDIO_MASTERS=$($buckets['audio-masters'])
GCS_BUCKET_GENERATED_AUDIO=$($buckets['generated-audio'])
GCS_BUCKET_GENERATED_VIDEO=$($buckets['generated-video'])

# Service Account
GCP_SERVICE_ACCOUNT=$serviceAccountEmail
GCP_KEY_FILE=$keyFile
"@

$configOutput | Out-File -FilePath ".\gcp-config.env" -Encoding UTF8
Write-Success "`n✅ Configuration saved to: .\gcp-config.env"
