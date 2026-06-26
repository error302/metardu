#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# METARDU Database Migration Runner
# ──────────────────────────────────────────────────────────────────────────
# Applies SQL migrations in order to the PostgreSQL database.
# Tracks applied migrations in a _migrations table to avoid re-running.
#
# Usage:
#   ./scripts/run-migrations.sh              # Apply all pending migrations
#   ./scripts/run-migrations.sh --dry-run    # Show what would be applied
#
# Environment:
#   DATABASE_URL  — PostgreSQL connection string (required)
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN — no changes will be made"
fi

# Resolve DATABASE_URL
DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" && -f .env.local ]]; then
  # Try to load from .env.local
  DB_URL=$(grep '^DATABASE_URL=' .env.local | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi
if [[ -z "$DB_URL" && -f .env ]]; then
  DB_URL=$(grep '^DATABASE_URL=' .env | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "$DB_URL" ]]; then
  echo "❌ DATABASE_URL not found. Set it in environment or .env.local"
  exit 1
fi

MIGRATION_DIR="$(cd "$(dirname "$0")/.." && pwd)/src/lib/db/migrations"

if [[ ! -d "$MIGRATION_DIR" ]]; then
  echo "❌ Migration directory not found: $MIGRATION_DIR"
  exit 1
fi

echo "📂 Migration directory: $MIGRATION_DIR"
echo "🗄️  Database: $(echo "$DB_URL" | sed 's/:[^:@]*@/:***@/')"

# Helper: run SQL
run_sql() {
  local sql="$1"
  if $DRY_RUN; then
    echo "$sql"
  else
    psql "$DB_URL" -c "$sql" 2>&1
  fi
}

# Helper: run SQL file
run_sql_file() {
  local file="$1"
  if $DRY_RUN; then
    echo "--- Would apply: $(basename "$file") ---"
  else
    psql "$DB_URL" -f "$file" 2>&1
  fi
}

# Create _migrations tracking table if not exists
echo ""
echo "🔧 Ensuring _migrations table exists..."
run_sql "
CREATE TABLE IF NOT EXISTS _migrations (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    applied_at  TIMESTAMPTZ DEFAULT NOW(),
    checksum    VARCHAR(64)
);
"

# Get list of already-applied migrations
if ! $DRY_RUN; then
  APPLIED=$(psql "$DB_URL" -t -A -c "SELECT name FROM _migrations ORDER BY name;" 2>/dev/null || echo "")
else
  APPLIED=""
fi

# Find and apply pending migrations
PENDING=0
for file in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
  name=$(basename "$file")

  if echo "$APPLIED" | grep -q "^${name}$"; then
    echo "  ✅ Already applied: $name"
    continue
  fi

  echo "  🔄 Applying: $name"
  PENDING=$((PENDING + 1))

  if ! $DRY_RUN; then
    # Compute checksum
    checksum=$(sha256sum "$file" | cut -d' ' -f1)

    # Apply migration
    if run_sql_file "$file"; then
      # Record in _migrations
      psql "$DB_URL" -c "INSERT INTO _migrations (name, checksum) VALUES ('$name', '$checksum') ON CONFLICT (name) DO NOTHING;" 2>&1
      echo "  ✅ Applied: $name"
    else
      echo "  ❌ Failed: $name — stopping migration"
      exit 1
    fi
  fi
done

echo ""
if [[ $PENDING -eq 0 ]]; then
  echo "✅ All migrations up to date — no pending migrations"
else
  echo "✅ Applied $PENDING migration(s)"
fi
