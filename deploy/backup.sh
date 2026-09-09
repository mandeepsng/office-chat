#!/usr/bin/env bash
#
# OfficeChat — SQLite backup script.
# Creates a consistent snapshot using SQLite's online backup API and keeps
# the last 14 days. Schedule it with cron:
#
#   crontab -e
#   0 3 * * *  /opt/office-chat/deploy/backup.sh >> /var/log/officechat-backup.log 2>&1

set -euo pipefail

DB_PATH="${DATABASE_PATH:-/opt/office-chat/data/officechat.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/office-chat/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/officechat-$STAMP.db"

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: database not found at $DB_PATH"
  exit 1
fi

# .backup takes a consistent snapshot even while the server is writing.
sqlite3 "$DB_PATH" ".backup '$DEST'"
gzip "$DEST"
echo "$(date -Is)  backup -> $DEST.gz"

# Prune old backups.
find "$BACKUP_DIR" -name 'officechat-*.db.gz' -mtime "+$RETENTION_DAYS" -delete
