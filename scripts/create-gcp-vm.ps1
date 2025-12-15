# Sun Pharma Video Platform - VM Setup Script for Windows/PowerShell
# For creating GCP VM using gcloud CLI

param(
    [string]$ProjectId = "",
    [string]$Zone = "asia-south1-a",
    [string]$MachineName = "sunpharma-video-platform",
    [string]$MachineType = "e2-medium"
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Sun Pharma Video Platform - GCP VM Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "Error: gcloud CLI is not installed." -ForegroundColor Red
    Write-Host "Please install from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Check authentication
$authList = gcloud auth list --format="value(account)" 2>&1
if (-not $authList -or $authList -match "ERROR") {
    Write-Host "Please authenticate with Google Cloud first:" -ForegroundColor Yellow
    gcloud auth login
}

# Get or set project
if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Host "Please enter your GCP Project ID:" -ForegroundColor Yellow
        $ProjectId = Read-Host
    }
}
gcloud config set project $ProjectId
Write-Host "Using project: $ProjectId" -ForegroundColor Green

# Create firewall rules
Write-Host ""
Write-Host "Creating firewall rules..." -ForegroundColor Cyan
gcloud compute firewall-rules create allow-http --allow tcp:80 --target-tags=http-server --quiet 2>$null
gcloud compute firewall-rules create allow-https --allow tcp:443 --target-tags=https-server --quiet 2>$null

# Create VM
Write-Host ""
Write-Host "Creating VM instance: $MachineName in $Zone..." -ForegroundColor Cyan

$startupScript = @"
#!/bin/bash
apt-get update
apt-get install -y docker.io docker-compose git
systemctl enable docker
systemctl start docker
mkdir -p /opt/sunpharma
"@

gcloud compute instances create $MachineName `
    --zone=$Zone `
    --machine-type=$MachineType `
    --image-family=ubuntu-2204-lts `
    --image-project=ubuntu-os-cloud `
    --boot-disk-size=50GB `
    --boot-disk-type=pd-balanced `
    --tags=http-server,https-server `
    --metadata=startup-script=$startupScript

# Get external IP
$externalIp = gcloud compute instances describe $MachineName --zone=$Zone --format="value(networkInterfaces[0].accessConfigs[0].natIP)"

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "VM Created Successfully!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "VM Details:" -ForegroundColor Cyan
Write-Host "  Name: $MachineName"
Write-Host "  Zone: $Zone"
Write-Host "  External IP: $externalIp"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. SSH into the VM:"
Write-Host "   gcloud compute ssh $MachineName --zone=$Zone"
Write-Host ""
Write-Host "2. Clone and deploy:"
Write-Host "   cd /opt/sunpharma"
Write-Host "   git clone <your-repo-url> ."
Write-Host "   docker-compose up -d --build"
Write-Host ""
Write-Host "3. Access the application:"
Write-Host "   http://$externalIp"
Write-Host ""
Write-Host "4. (Optional) Setup a domain and SSL"
