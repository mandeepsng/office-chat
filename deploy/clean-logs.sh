#!/usr/bin/env bash
#
# OfficeChat — hard log-size guard.
# pm2-logrotate already rotates files, but this enforces an absolute cap:
# when the PM2 log directory exceeds LIMIT_MB, delete rotated/compressed
# logs and flush the active ones so total size drops back down.
#
# Schedule hourly:
#   crontab -e
#   0 * * * *  /opt/office-chat/deploy/clean-logs.sh >> /var/log/officechat-cleanlogs.log 2>&1

set -euo pipefail

LIMIT_MB="${LOG_LIMIT_MB:-150}"
LOG_DIR="${PM2_LOG_DIR:-$HOME/.pm2/logs}"

if [[ ! -d "$LOG_DIR" ]]; then
  echo "$(date -Is)  no PM2 log dir at $LOG_DIR, nothing to do"
  exit 0
fi

# Current total size of the log dir in MB.
size_mb() { du -sm "$LOG_DIR" 2>/dev/null | cut -f1; }

CURRENT="$(size_mb)"
if (( CURRENT <= LIMIT_MB )); then
  echo "$(date -Is)  ${CURRENT}MB <= ${LIMIT_MB}MB, ok"
  exit 0
fi

echo "$(date -Is)  ${CURRENT}MB > ${LIMIT_MB}MB, cleaning"

# 1. Drop rotated files first (these are the safe-to-delete history).
find "$LOG_DIR" -type f \( -name '*.gz' -o -name '*__*.log' \) -delete

# 2. If still over the limit, flush the active logs (empties officechat-out/error).
if (( "$(size_mb)" > LIMIT_MB )); then
  if command -v pm2 >/dev/null; then
    pm2 flush >/dev/null 2>&1 || true
  else
    # Fallback: truncate active logs without deleting the files.
    find "$LOG_DIR" -type f -name '*.log' -exec truncate -s 0 {} +
  fi
fi

echo "$(date -Is)  done, now $(size_mb)MB"
