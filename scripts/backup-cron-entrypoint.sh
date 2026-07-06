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

BACKUP_CRON="${BACKUP_CRON:-0 2 * * *}"  # daily at 02:00 UTC

# Install the cron job
echo "$BACKUP_CRON /app/scripts/backup.sh >> /var/log/backup.log 2>&1" | crontab -u root -

echo "Backup cron installed: $BACKUP_CRON"
echo "Backups will be written to: ${BACKUP_DIR:-/backups}"

echo "Starting cron daemon..."

# Some Docker runtimes prevent crond from calling setpgid (e.g. when it
# is PID 1 inside an unprivileged container). Try the standard
# foreground crond first; if it dies immediately fall back to a manual
# scheduler so the container still does its job.
crond -f -l 0 || echo "crond exited (likely setpgid in unprivileged container) — falling back to manual schedule"

while true; do
  /app/scripts/backup.sh >> /var/log/backup.log 2>&1 || true
  sleep 86400
done
