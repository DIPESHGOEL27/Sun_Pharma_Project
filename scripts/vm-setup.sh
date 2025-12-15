#!/bin/bash

# Sun Pharma Video Platform - VM Setup Script
# This script sets up a fresh Ubuntu 22.04 VM for the platform
# Run this after SSH-ing into the VM created by gcp-setup.ps1

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Sun Pharma Video Platform - VM Configuration Script      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Please don't run as root. Run as regular user with sudo access."
    exit 1
fi

# Update system
echo "📦 Step 1: Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install required packages
echo ""
echo "📦 Step 2: Installing required packages..."
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    ffmpeg \
    jq \
    htop \
    unzip

# Install Docker
echo ""
echo "🐳 Step 3: Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    echo "  ✅ Docker installed"
else
    echo "  ✅ Docker already installed"
fi

# Add current user to docker group
sudo usermod -aG docker $USER
echo "  ✅ User added to docker group (re-login required)"

# Install Node.js 20 (for local development if needed)
echo ""
echo "📦 Step 4: Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "  ✅ Node.js $(node -v) installed"
else
    echo "  ✅ Node.js $(node -v) already installed"
fi

# Create application directory
echo ""
echo "📁 Step 5: Creating application directories..."
sudo mkdir -p /opt/sunpharma
sudo chown $USER:$USER /opt/sunpharma

# Create data directories
mkdir -p /opt/sunpharma/data/uploads/image
mkdir -p /opt/sunpharma/data/uploads/audio
mkdir -p /opt/sunpharma/data/uploads/video
mkdir -p /opt/sunpharma/data/uploads/audio-masters
mkdir -p /opt/sunpharma/data/db
mkdir -p /opt/sunpharma/credentials
mkdir -p /opt/sunpharma/logs

# Set permissions
sudo chmod -R 755 /opt/sunpharma/data
echo "  ✅ Directories created"

# Create environment file template
echo ""
echo "📝 Step 6: Creating environment file template..."
cat > /opt/sunpharma/.env.template << 'EOF'
# ================================================
# Sun Pharma Video Platform - Environment Configuration
# ================================================
# Copy this file to .env and fill in the values

# Server Configuration
PORT=3001
NODE_ENV=production
FRONTEND_URL=http://YOUR_STATIC_IP

# JWT Secret (generate a strong random string)
JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_STRING

# ElevenLabs API (for voice cloning)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Google Cloud Platform
GCP_PROJECT_ID=your-project-id
GCP_KEY_FILE=/opt/sunpharma/credentials/gcp-key.json

# GCS Buckets (created by gcp-setup.ps1)
GCS_BUCKET_UPLOADS=sunpharma-video-uploads-your-project-id
GCS_BUCKET_AUDIO_MASTERS=sunpharma-video-audio-masters-your-project-id
GCS_BUCKET_GENERATED_AUDIO=sunpharma-video-generated-audio-your-project-id
GCS_BUCKET_GENERATED_VIDEO=sunpharma-video-generated-video-your-project-id

# Email Configuration (AWS SES recommended for production)
AWS_SES_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
SES_FROM_EMAIL=noreply@sunpharma.com

# Or use SMTP
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your_email@gmail.com
# SMTP_PASS=your_app_password

# Database
DATABASE_PATH=/opt/sunpharma/data/db/sun_pharma.db
EOF
echo "  ✅ Environment template created"

# Configure Nginx
echo ""
echo "🌐 Step 7: Configuring Nginx..."
sudo tee /etc/nginx/sites-available/sunpharma > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Frontend (React/Vite)
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increased timeouts for file uploads
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
        client_max_body_size 100M;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:3001;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/sunpharma /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
sudo nginx -t && sudo systemctl reload nginx
echo "  ✅ Nginx configured"

# Create systemd services for Docker Compose
echo ""
echo "🔧 Step 8: Creating systemd service..."
sudo tee /etc/systemd/system/sunpharma.service > /dev/null << EOF
[Unit]
Description=Sun Pharma Video Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/sunpharma
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=$USER
Group=$USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
echo "  ✅ Systemd service created"

# Print summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              ✅ VM Setup Complete!                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. IMPORTANT: Log out and log back in for docker group changes"
echo "   exit"
echo ""
echo "2. Clone the repository:"
echo "   cd /opt/sunpharma"
echo "   git clone <your-repo-url> ."
echo ""
echo "3. Copy GCP credentials to VM:"
echo "   # From your local machine:"
echo "   gcloud compute scp ./credentials/sunpharma-video-sa-key.json \\"
echo "     <vm-name>:/opt/sunpharma/credentials/gcp-key.json --zone=asia-south1-a"
echo ""
echo "4. Configure environment:"
echo "   cp .env.template .env"
echo "   nano .env"
echo ""
echo "5. Build and start containers:"
echo "   docker compose up -d --build"
echo ""
echo "6. Enable auto-start on boot:"
echo "   sudo systemctl enable sunpharma"
echo ""
echo "7. (Optional) Setup SSL with Let's Encrypt:"
echo "   sudo certbot --nginx -d your-domain.com"
echo ""
echo "📊 Useful Commands:"
echo "   docker compose logs -f          # View logs"
echo "   docker compose ps               # Check status"
echo "   docker compose restart          # Restart services"
echo "   sudo systemctl status sunpharma # Check service status"
echo ""
echo ""
echo "5. Check logs:"
echo "   docker compose logs -f"
echo ""
echo "Note: You may need to log out and back in for docker group to take effect."
