#!/bin/bash
set -euo pipefail
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/mohameddosho20/backups"
mkdir -p "$BACKUP_DIR"

# Full dump from Docker PostgreSQL
if docker ps | grep -q metardu_db; then
  docker exec metardu_db_1 pg_dump -U postgres postgres \
    | gzip > "$BACKUP_DIR/metardu_$TIMESTAMP.sql.gz"
elif command -v pg_dump &>/dev/null; then
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/metardu_$TIMESTAMP.sql.gz"
else
  echo "ERROR: No PostgreSQL accessible. Backup failed."
  exit 1
fi

# Keep only last 7 daily backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "[$(date)] Backup complete: metardu_$TIMESTAMP.sql.gz"
