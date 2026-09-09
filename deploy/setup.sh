#!/usr/bin/env bash
#
# OfficeChat — one-time VPS provisioning script (Ubuntu 22.04 / 24.04).
# Run as a sudo-capable user:  bash deploy/setup.sh
#
# Installs Node 22, pnpm, PM2, build tools, and the native deps needed to
# compile better-sqlite3. Does NOT touch your code or .env — run deploy.sh
# for that afterwards.

set -euo pipefail

echo "==> Updating system packages"
sudo apt update && sudo apt upgrade -y

echo "==> Installing Node.js 22 LTS"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "==> Installing build tools for better-sqlite3"
sudo apt install -y build-essential python3 git

echo "==> Installing pnpm + PM2"
sudo npm install -g pnpm pm2

echo "==> Done."
echo "    node:  $(node -v)"
echo "    pnpm:  $(pnpm -v)"
echo "    pm2:   $(pm2 -v)"
echo
echo "Next: clone your repo to /opt/office-chat, create apps/server/.env,"
echo "then run:  bash deploy/deploy.sh"
