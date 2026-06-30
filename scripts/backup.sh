#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# 1. Database backup (pg_dump)
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Backing up database..."
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
  echo "Database backup: $BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
fi

# 2. Keep last 30 backups, delete older
ls -t "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --

echo "Backup complete. $(ls "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | wc -l) backups retained."
