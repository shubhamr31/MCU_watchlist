#!/usr/bin/env bash
# Purpose: build the MCU watchlist frontend, run the backend as a systemd service, and serve both via Caddy (auto HTTPS)
#          at https://thesacredtimeline.duckdns.org on the Oracle VM.
# Triggered by: user request to migrate the MCU project to the Oracle Always Free VM.
set -euo pipefail

DOMAIN=thesacredtimeline.duckdns.org
APP=/home/ubuntu/MCU_watchlist

cd "$APP"
git pull -q
npm install --no-audit --no-fund >/dev/null

# Frontend build (Google client id reuses the backend value; it is public by design)
GCID=$(grep '^GOOGLE_CLIENT_ID=' backend/.env | cut -d= -f2-)
cat > frontend/.env.production <<EOF
VITE_API_BASE_URL=https://$DOMAIN
VITE_GOOGLE_CLIENT_ID=$GCID
EOF
npm run build
sudo mkdir -p /var/www/mcu
sudo rsync -a --delete frontend/dist/ /var/www/mcu/

# Backend service
sudo tee /etc/systemd/system/mcu-backend.service >/dev/null <<EOF
[Unit]
Description=MCU watchlist backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=$APP/backend
EnvironmentFile=$APP/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now mcu-backend
sudo systemctl restart mcu-backend

# Caddy: static frontend + /api proxy, automatic Let's Encrypt HTTPS
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
    encode gzip
    handle /api/* {
        reverse_proxy 127.0.0.1:4000
    }
    handle {
        root * /var/www/mcu
        try_files {path} /index.html
        file_server
    }
}
EOF
sudo systemctl reload caddy || sudo systemctl restart caddy

sleep 3
systemctl is-active mcu-backend caddy
