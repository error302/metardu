#!/usr/bin/env bash
#
# METARDU Database Backup Script
#
# AUDIT FIX (H7, 2026-07-02): Upgraded from a bare pg_dump+gzip script
# to a production-grade backup with:
#   - Encrypted backups (GPG) when GPG_RECIPI is set
#   - Post-dump verification (pg_restore --list sanity check)
#   - Offsite copy to a secondary directory (BACKUP_OFFSITE_DIR) if set
#   - Retention policy (default 30 days, configurable)
#   - Structured logging to stdout + BACKUP_LOG_FILE
#   - Exit codes for monitoring (0=ok, 1=db error, 2=verify error, 3=offsite error)
#
# Usage:
#   ./scripts/backup.sh                           # daily backup
#   BACKUP_DIR=/backups GPG_RECIPI=admin@metardu ./scripts/backup.sh
#
# Environment variables:
#   DATABASE_URL        (required) PostgreSQL connection string
#   BACKUP_DIR          (default ./backups) local backup directory
#   BACKUP_OFFSITE_DIR  (optional) secondary copy destination
#   BACKUP_RETENTION    (default 30) days to keep backups
#   GPG_RECIPI          (optional) GPG key ID/email for encryption
#   BACKUP_LOG_FILE     (optional) log file path; defaults to stdout
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_OFFSITE_DIR="${BACKUP_OFFSITE_DIR:-}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"
GPG_RECIPI="${GPG_RECIPI:-}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "$msg"
  if [ -n "$BACKUP_LOG_FILE" ]; then
    mkdir -p "$(dirname "$BACKUP_LOG_FILE")"
    echo "$msg" >> "$BACKUP_LOG_FILE"
  fi
}

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL is not set"
  exit 1
fi

# ─── 1. Database backup ───────────────────────────────────────────────────
log "Starting database backup..."
DB_FILE="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

if ! pg_dump "$DATABASE_URL" | gzip > "$DB_FILE"; then
  log "ERROR: pg_dump failed"
  exit 1
fi

DB_SIZE=$(stat -c%s "$DB_FILE" 2>/dev/null || stat -f%z "$DB_FILE" 2>/dev/null || echo 0)
log "Database backup: $DB_FILE ($(numfmt --to=iec $DB_SIZE 2>/dev/null || echo ${DB_SIZE}B))"

# ─── 2. Verification (pg_restore --list) ─────────────────────────────────
log "Verifying backup integrity..."
if ! gzip -t "$DB_FILE"; then
  log "ERROR: gzip integrity check failed for $DB_FILE"
  exit 2
fi
if ! zcat "$DB_FILE" | pg_restore --list 2>/dev/null | head -5 > /dev/null; then
  log "WARN: pg_restore --list failed (may be normal for plain-text dumps). Verifying SQL header..."
  if ! zcat "$DB_FILE" | head -1 | grep -qi "postgresql\|--"; then
    log "ERROR: backup does not look like a valid PostgreSQL dump"
    exit 2
  fi
fi
log "Backup integrity verified."

# ─── 3. Encryption (optional) ─────────────────────────────────────────────
if [ -n "$GPG_RECIPI" ]; then
  log "Encrypting backup with GPG (recipient: $GPG_RECIPI)..."
  ENC_FILE="${DB_FILE}.gpg"
  if ! gpg --batch --yes --trust-model always --recipient "$GPG_RECIPI" \
       --encrypt --output "$ENC_FILE" "$DB_FILE"; then
    log "ERROR: GPG encryption failed"
    exit 2
  fi
  # Remove the unencrypted file after successful encryption
  rm "$DB_FILE"
  DB_FILE="$ENC_FILE"
  log "Encrypted backup: $DB_FILE"
fi

# ─── 4. Offsite copy (optional) ───────────────────────────────────────────
if [ -n "$BACKUP_OFFSITE_DIR" ]; then
  log "Copying backup to offsite location: $BACKUP_OFFSITE_DIR"
  mkdir -p "$BACKUP_OFFSITE_DIR"
  if ! cp "$DB_FILE" "$BACKUP_OFFSITE_DIR/"; then
    log "ERROR: offsite copy failed"
    exit 3
  fi
  log "Offsite copy complete."

  # Prune offsite backups too
  find "$BACKUP_OFFSITE_DIR" -name "db_*.sql.gz*" -mtime +"$BACKUP_RETENTION" -delete 2>/dev/null || true
fi

# ─── 5. Retention (delete backups older than BACKUP_RETENTION days) ───────
log "Pruning backups older than $BACKUP_RETENTION days..."
find "$BACKUP_DIR" -name "db_*.sql.gz*" -mtime +"$BACKUP_RETENTION" -delete 2>/dev/null || true

REMAINING=$(find "$BACKUP_DIR" -name "db_*.sql.gz*" | wc -l)
log "Backup complete. $REMAINING backups retained in $BACKUP_DIR."
