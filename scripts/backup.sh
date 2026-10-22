#!/usr/bin/env bash
# METARDU database + uploads backup. Completion requires a verified pair and,
# when configured, verified copies of both files in BACKUP_OFFSITE_DIR.
# GPG_RECIPI encrypts the database archive ONLY; uploads remain unencrypted.
# Exit codes: 1=input/dump/storage, 2=archive/encryption, 3=configured copy.
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_OFFSITE_DIR="${BACKUP_OFFSITE_DIR:-}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"
GPG_RECIPI="${GPG_RECIPI:-}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-}"
UPLOADS_DIR="${UPLOADS_DIR:-/uploads}"

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "$msg"
  if [ -n "$BACKUP_LOG_FILE" ]; then
    mkdir -p -- "$(dirname -- "$BACKUP_LOG_FILE")"
    echo "$msg" >> "$BACKUP_LOG_FILE"
  fi
}

if [[ ! "$BACKUP_RETENTION" =~ ^[0-9]+$ ]]; then
  log "ERROR: BACKUP_RETENTION must be a nonnegative integer"
  exit 1
fi
if [ ! -d "$UPLOADS_DIR" ]; then
  log "ERROR: required uploads directory is missing"
  exit 1
fi
if [ -n "${DATABASE_URL:-}" ]; then
  DB_DUMP_ARGUMENTS=(--dbname="$DATABASE_URL")
elif [ -n "${PGHOST:-}" ] && [ -n "${PGDATABASE:-}" ] && [ -n "${PGUSER:-}" ]; then
  DB_DUMP_ARGUMENTS=(--host "$PGHOST" --port "${PGPORT:-5432}" --username "$PGUSER" --dbname "$PGDATABASE")
else
  log "ERROR: set DATABASE_URL or PGHOST/PGDATABASE/PGUSER"
  exit 1
fi

mkdir -p -- "$BACKUP_DIR"
BACKUP_DIR=$(cd -- "$BACKUP_DIR" && pwd -P)
# Serialize publication/retention. An interrupted run may leave a lock; fail
# closed until an operator verifies no active backup before removing it.
LOCK_DIR="$BACKUP_DIR/.backup.lock"
if ! mkdir -- "$LOCK_DIR"; then
  log "ERROR: backup lock exists or cannot be created; inspect before retrying"
  exit 1
fi
STAGE_DIR=''
cleanup() {
  if [ -n "$STAGE_DIR" ]; then
    case "$STAGE_DIR" in "$BACKUP_DIR"/.backup-stage.*) rm -rf -- "$STAGE_DIR";; esac
  fi
  rmdir -- "$LOCK_DIR"
}
trap cleanup EXIT
STAGE_DIR=$(mktemp -d "$BACKUP_DIR/.backup-stage.XXXXXXXX")
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
DB_FILE="$STAGE_DIR/db_${TIMESTAMP}.sql.gz"
UPLOADS_FILE="$STAGE_DIR/uploads_${TIMESTAMP}.tar.gz"

log "Starting database backup..."
if ! pg_dump "${DB_DUMP_ARGUMENTS[@]}" | gzip > "$DB_FILE"; then
  log "ERROR: pg_dump failed"
  exit 1
fi
# Consume the full stream to avoid SIGPIPE on large plain-SQL pg_dump output.
if ! gzip -t "$DB_FILE" || ! gzip -dc "$DB_FILE" | awk 'NR <= 10 && $0 == "-- PostgreSQL database dump" { header = 1 } END { exit(header ? 0 : 1) }'; then
  log "ERROR: database gzip/SQL header verification failed"
  exit 2
fi
log "Archiving uploads..."
if ! tar -czf "$UPLOADS_FILE" -C "$UPLOADS_DIR" .; then
  log "ERROR: required uploads archive failed"
  exit 2
fi
if ! gzip -t "$UPLOADS_FILE" || ! tar -tzf "$UPLOADS_FILE" > "$STAGE_DIR/uploads.list" || ! awk 'NR == 1 && ($0 == "./" || $0 == ".") { root = 1 } END { exit(root ? 0 : 1) }' "$STAGE_DIR/uploads.list"; then
  log "ERROR: uploads gzip/tar verification failed"
  exit 2
fi
log "Database and uploads archive integrity verified."

if [ -n "$GPG_RECIPI" ]; then
  log "Encrypting database archive only; uploads remain unencrypted."
  if ! gpg --batch --yes --trust-model always --recipient "$GPG_RECIPI" \
       --encrypt --output "${DB_FILE}.gpg" "$DB_FILE" || [ ! -s "${DB_FILE}.gpg" ]; then
    log "ERROR: GPG encryption failed"
    exit 2
  fi
  rm -- "$DB_FILE"
  DB_FILE="${DB_FILE}.gpg"
fi

# Hard links publish without overwriting an existing timestamp. Local staging
# is on the same filesystem. Partial new pairs are never completion.
for source_file in "$DB_FILE" "$UPLOADS_FILE"; do
  if ! ln -T -- "$source_file" "$BACKUP_DIR/$(basename -- "$source_file")"; then
    log "ERROR: could not publish archive without overwriting an existing file"
    exit 1
  fi
done
DB_FILE="$BACKUP_DIR/$(basename -- "$DB_FILE")"
UPLOADS_FILE="$BACKUP_DIR/$(basename -- "$UPLOADS_FILE")"

if [ -n "$BACKUP_OFFSITE_DIR" ]; then
  if ! mkdir -p -- "$BACKUP_OFFSITE_DIR"; then
    log "ERROR: offsite directory unavailable"
    exit 3
  fi
  BACKUP_OFFSITE_DIR=$(cd -- "$BACKUP_OFFSITE_DIR" && pwd -P)
  if [ "$BACKUP_OFFSITE_DIR" = "$BACKUP_DIR" ]; then
    log "ERROR: offsite destination must differ from local archive directory"
    exit 3
  fi
  for source_file in "$DB_FILE" "$UPLOADS_FILE"; do
    destination="$BACKUP_OFFSITE_DIR/$(basename -- "$source_file")"
    # noclobber opens only a new file; copying to the already-open descriptor
    # prevents replacement of an earlier archive at this destination.
    if ! (set -C; cp -- "$source_file" /dev/stdout > "$destination") || ! cmp -s -- "$source_file" "$destination"; then
      log "ERROR: configured offsite archive copy/integrity check failed"
      exit 3
    fi
  done
  log "Both configured offsite copies verified."
fi

# No retention is reached until every required archive/copy has passed.
log "Pruning archives older than $BACKUP_RETENTION days..."
for archive_dir in "$BACKUP_DIR" ${BACKUP_OFFSITE_DIR:+"$BACKUP_OFFSITE_DIR"}; do
  find "$archive_dir" -maxdepth 1 -type f \( -name 'db_*.sql.gz' -o -name 'db_*.sql.gz.gpg' -o -name 'uploads_*.tar.gz' \) -mtime +"$BACKUP_RETENTION" -delete
done
log "Backup complete. Verified database and uploads archives retained in $BACKUP_DIR."
