#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# METARDU Docker Entrypoint
# ──────────────────────────────────────────────────────────────────────────
# Runs database migrations before starting the Next.js server.
# Migrations are idempotent — safe to run on every container start.
# ──────────────────────────────────────────────────────────────────────────

set -e

echo "=========================================="
echo "  METARDU - Starting container"
echo "=========================================="

# Run database migrations if DATABASE_URL is available
if [ -n "${DATABASE_URL:-}" ]; then
  echo ""
  echo "  Running database migrations..."

  # Use the unified migration runner (Node.js ESM — uses pg module)
  if [ -f /app/migrate-unified.mjs ]; then
    echo "  Using unified migration runner..."
    node /app/migrate-unified.mjs || echo "  WARNING: Migration runner failed - app will start anyway (check logs)"
  elif [ -f /app/migrate.js ]; then
    echo "  Using legacy migration runner..."
    node /app/migrate.js || echo "  WARNING: Migration runner failed - app will start anyway (check logs)"
  else
    echo "  WARNING: No migration runner found - skipping auto-migration"
    echo "  Run 'node scripts/migrate-unified.mjs' manually to apply migrations"
  fi

  echo ""
else
  echo "  WARNING: DATABASE_URL not set - skipping migrations"
  echo "  Set DATABASE_URL to enable automatic migration on startup"
  echo ""
fi

echo "Starting Next.js server..."
echo ""

# Start the Next.js server
exec node server.js
