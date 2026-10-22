#!/usr/bin/env bash
# Apply a trusted pg_dump plain-SQL archive to the explicitly selected target.
# This does not create/drop a database or restore uploads. SQL dumps execute
# code: accept only a trusted archive. A header check is not a trust signature.
# DATABASE_URL required for restore; BACKUP_DIR defaults to ./backups.
# SKIP_SAFETY_BACKUP=1 explicitly skips the verified pre-restore database dump.
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
SKIP_SAFETY_BACKUP="${SKIP_SAFETY_BACKUP:-0}"
SAFETY_FILE=''

if [ "${1:-}" = '--list' ] || [ "${1:-}" = '-l' ]; then
  echo "Available database backups in $BACKUP_DIR:"
  shopt -s nullglob
  for file in "$BACKUP_DIR"/db_*.sql.gz "$BACKUP_DIR"/db_*.sql.gz.gpg; do
    printf '%s\n' "$file"
  done
  exit 0
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo 'ERROR: DATABASE_URL is not set' >&2
  exit 1
fi
BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file> | --list" >&2
  exit 1
fi
case "$BACKUP_FILE" in /*) FILE_PATH="$BACKUP_FILE";; *) FILE_PATH="$BACKUP_DIR/$BACKUP_FILE";; esac
if [ ! -f "$FILE_PATH" ]; then
  echo 'ERROR: backup file not found' >&2
  exit 1
fi
case "$FILE_PATH" in *.sql|*.sql.gz|*.sql.gz.gpg) ;; *)
  echo 'ERROR: expected .sql, .sql.gz, or .sql.gz.gpg' >&2
  exit 1;;
esac

STAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/metardu-restore.XXXXXXXX")
cleanup() {
  case "$STAGE_DIR" in "${TMPDIR:-/tmp}"/metardu-restore.*) rm -rf -- "$STAGE_DIR";; esac
}
trap cleanup EXIT
SQL_FILE="$STAGE_DIR/restore.sql"
# Fully materialize before any database command: late decompression failure
# must not permit psql to commit an incomplete stream.
case "$FILE_PATH" in
  *.sql.gz.gpg)
    if ! gpg --batch --decrypt "$FILE_PATH" | gzip -dc > "$SQL_FILE"; then
      echo 'ERROR: archive decryption/decompression failed' >&2; exit 1
    fi;;
  *.sql.gz)
    if ! gzip -dc "$FILE_PATH" > "$SQL_FILE"; then
      echo 'ERROR: archive decompression failed' >&2; exit 1
    fi;;
  *.sql) cat -- "$FILE_PATH" > "$SQL_FILE";;
esac
if ! awk 'NR <= 10 && $0 == "-- PostgreSQL database dump" { header = 1 } END { exit(header ? 0 : 1) }' "$SQL_FILE"; then
  echo 'ERROR: input does not have a pg_dump SQL header' >&2
  exit 1
fi

echo 'METARDU Database Restore'
echo 'Target: database configured through DATABASE_URL (credentials hidden).'
echo 'WARNING: This applies the supplied SQL to the selected database.'
echo 'No automatic database drop/recreate or uploads restoration is performed.'
if [ "$SKIP_SAFETY_BACKUP" = '1' ]; then
  echo 'Safety backup will be skipped by explicit configuration.'
else
  echo 'A verified database safety backup is required before applying SQL.'
fi
if ! read -r -p "Type 'RESTORE' to confirm: " CONFIRM || [ "$CONFIRM" != 'RESTORE' ]; then
  echo 'Aborted.'
  exit 0
fi

if [ "$SKIP_SAFETY_BACKUP" != '1' ]; then
  mkdir -p -- "$BACKUP_DIR"
  SAFETY_FILE=$(mktemp "$BACKUP_DIR/pre_restore_$(date -u +%Y%m%d_%H%M%S)_XXXXXXXX.sql.gz")
  if ! pg_dump --dbname="$DATABASE_URL" 2> "$STAGE_DIR/dump.log" | gzip > "$SAFETY_FILE"; then
    echo 'ERROR: pre-restore safety backup failed; SQL was not applied.' >&2
    exit 1
  fi
  if ! gzip -t "$SAFETY_FILE" || ! gzip -dc "$SAFETY_FILE" | awk 'NR <= 10 && $0 == "-- PostgreSQL database dump" { header = 1 } END { exit(header ? 0 : 1) }'; then
    echo 'ERROR: pre-restore safety backup verification failed; SQL was not applied.' >&2
    exit 1
  fi
  echo "Safety backup verified: $SAFETY_FILE"
fi

echo 'Restoring with SQL-error rejection in one transaction...'
# Suppress client diagnostics because libpq errors may include connection
# details. Exit status remains authoritative; never log a connection string.
if ! psql -X --set ON_ERROR_STOP=1 --single-transaction --file "$SQL_FILE" --dbname="$DATABASE_URL" > "$STAGE_DIR/client.log" 2>&1; then
  echo 'ERROR: restore failed; psql rejected the transaction. Client diagnostics withheld to protect credentials.' >&2
  exit 1
fi
echo 'Restore complete.'
if [ -n "$SAFETY_FILE" ]; then
  echo "Safety backup: $SAFETY_FILE"
else
  echo 'Safety backup: skipped by explicit configuration.'
fi
