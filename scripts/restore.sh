#!/usr/bin/env bash
#
# METARDU Database Restore Script
#
# AUDIT FIX (H7, 2026-07-02): New script — previously no restore path
# existed, only backup.sh. This script:
#   - Lists available backups (with --list)
#   - Restores a specific backup file
#   - Supports GPG-encrypted backups (prompts for passphrase if needed)
#   - Takes a pre-restore safety backup (so you can undo)
#   - Asks for confirmation before overwriting the live DB
#
# Usage:
#   ./scripts/restore.sh --list                    # list available backups
#   ./scripts/restore.sh db_20260702_120000.sql.gz # restore specific backup
#   ./scripts/restore.sh db_20260702_120000.sql.gz.gpg  # restore encrypted
#
# Environment variables:
#   DATABASE_URL        (required) PostgreSQL connection string
#   BACKUP_DIR          (default ./backups) backup directory
#   SKIP_SAFETY_BACKUP  (default 0) set to 1 to skip pre-restore backup
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
SKIP_SAFETY_BACKUP="${SKIP_SAFETY_BACKUP:-0}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

# ─── --list mode ──────────────────────────────────────────────────────────
if [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
  echo "Available backups in $BACKUP_DIR:"
  echo "------------------------------------"
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "(directory does not exist)"
    exit 0
  fi
  for f in $(ls -1t "$BACKUP_DIR"/db_*.sql.gz* 2>/dev/null); do
    SIZE=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)
    SIZE_HR=$(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B")
    DATE=$(stat -c%y "$f" 2>/dev/null || stat -f%Sm "$f" 2>/dev/null || echo "unknown")
    BASENAME=$(basename "$f")
    printf "%-40s %10s  %s\n" "$BASENAME" "$SIZE_HR" "$DATE"
  done
  exit 0
fi

# ─── Restore mode ─────────────────────────────────────────────────────────
BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file> | --list" >&2
  echo "Example: $0 db_20260702_120000.sql.gz" >&2
  exit 1
fi

# Resolve the backup file path (allow bare filename or full path)
if [[ "$BACKUP_FILE" = /* ]]; then
  FILE_PATH="$BACKUP_FILE"
else
  FILE_PATH="$BACKUP_DIR/$BACKUP_FILE"
fi

if [ ! -f "$FILE_PATH" ]; then
  echo "ERROR: backup file not found: $FILE_PATH" >&2
  exit 1
fi

echo "=========================================="
echo "  METARDU Database Restore"
echo "=========================================="
echo "Backup file: $FILE_PATH"
echo "Target DB:   $DATABASE_URL"
echo ""

# Safety backup before restore
if [ "$SKIP_SAFETY_BACKUP" != "1" ]; then
  SAFETY_TS=$(date +%Y%m%d_%H%M%S)
  SAFETY_FILE="$BACKUP_DIR/pre_restore_${SAFETY_TS}.sql.gz"
  echo "Taking pre-restore safety backup → $SAFETY_FILE"
  if ! pg_dump "$DATABASE_URL" | gzip > "$SAFETY_FILE"; then
    echo "ERROR: pre-restore safety backup failed. Aborting." >&2
    exit 1
  fi
  echo "Safety backup complete. (To skip this in future, set SKIP_SAFETY_BACKUP=1)"
  echo ""
fi

# Confirmation prompt
echo "WARNING: This will DROP and recreate the database from the backup."
echo "All current data will be lost (safety backup taken above)."
read -p "Type 'RESTORE' to confirm: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 0
fi
echo ""

# Decompress + (optionally decrypt) + restore
echo "Restoring..."
case "$FILE_PATH" in
  *.sql.gz.gpg)
    # Encrypted + compressed
    if ! gpg --batch --yes --decrypt "$FILE_PATH" | gunzip | psql "$DATABASE_URL"; then
      echo "ERROR: restore failed" >&2
      exit 1
    fi
    ;;
  *.sql.gz)
    # Compressed only
    if ! zcat "$FILE_PATH" | psql "$DATABASE_URL"; then
      echo "ERROR: restore failed" >&2
      exit 1
    fi
    ;;
  *.sql)
    # Plain SQL
    if ! psql "$DATABASE_URL" < "$FILE_PATH"; then
      echo "ERROR: restore failed" >&2
      exit 1
    fi
    ;;
  *)
    echo "ERROR: unrecognized file extension. Expected .sql, .sql.gz, or .sql.gz.gpg" >&2
    exit 1
    ;;
esac

echo ""
echo "✓ Restore complete."
echo "  Safety backup: $SAFETY_FILE (if taken)"
echo "  To rollback:   $0 $(basename "$SAFETY_FILE")"
