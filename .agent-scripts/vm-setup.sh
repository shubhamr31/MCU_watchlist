#!/usr/bin/env bash
# Purpose: prepare the Oracle Always Free Ubuntu ARM VM (home-base) to host the MCU watchlist app:
#          open ports 80/443 in iptables, install Node 20 and Caddy.
# Triggered by: user request "migrate my mcu project to this VM" (free DuckDNS subdomain thesacredtimeline.duckdns.org).
set -euo pipefail

# 1. Open HTTP/HTTPS before the final REJECT rule (insert at position 5, after the SSH rule)
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save

# 2. Node 20 (NodeSource)
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

# 3. Caddy (official apt repo)
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
fi

node -v; npm -v; caddy version
sudo iptables -S INPUT
