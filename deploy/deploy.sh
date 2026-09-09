#!/usr/bin/env bash
#
# OfficeChat — deploy / update script.
# Pulls latest code, installs deps, and (re)starts the server under PM2.
# Safe to run repeatedly for updates.
#
# Usage (from the repo root):  bash deploy/deploy.sh

set -euo pipefail

# Resolve repo root regardless of where the script is called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

APP_NAME="officechat"
ENV_FILE="apps/server/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Create it first (copy from .env.example) and set OFFICE_CODE + DATABASE_PATH."
  exit 1
fi

echo "==> Pulling latest code"
if [[ -d .git ]]; then
  git pull --ff-only
fi

echo "==> Installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> Ensuring data directory exists"
DB_PATH="$(grep -E '^DATABASE_PATH=' "$ENV_FILE" | cut -d= -f2-)"
if [[ -n "${DB_PATH:-}" ]]; then
  mkdir -p "$(dirname "$DB_PATH")"
fi

echo "==> Starting / restarting server under PM2"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start "pnpm --filter @office-chat/server start" --name "$APP_NAME"
  pm2 save
  echo
  echo "First run detected. To start OfficeChat on boot, run the command"
  echo "that 'pm2 startup' prints below (needs sudo):"
  pm2 startup || true
fi

pm2 save
echo "==> Deploy complete. Logs:  pm2 logs $APP_NAME"
