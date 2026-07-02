#!/usr/bin/env bash
#
# METARDU Backup Cron Entrypoint
#
# AUDIT FIX (H7, 2026-07-02): This is the entrypoint for the
# metardu-backup sidecar container. It installs a cron job that runs
# scripts/backup.sh daily at 02:00 UTC (configurable via BACKUP_CRON).
#
# The sidecar shares the BACKUP_DIR volume with the host so backups
# persist across container restarts.
set -euo pipefail

BACKUP_CRON="${BACKUP_CRON:-0 2 * * *}"  # daily at 02:00 UTC

# Install the cron job
echo "$BACKUP_CRON /app/scripts/backup.sh >> /var/log/backup.log 2>&1" | crontab -

echo "Backup cron installed: $BACKUP_CRON"
echo "Backups will be written to: ${BACKUP_DIR:-/backups}"
echo "Starting cron daemon..."

# Run cron in the foreground
exec crond -f -l 8
