#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# METARDU Docker Entrypoint
# ──────────────────────────────────────────────────────────────────────────
# Verifies the already-migrated database using the restricted runtime role.
# The one-shot metardu-db-migrate service owns DDL permissions.
# ──────────────────────────────────────────────────────────────────────────

set -e

echo "=========================================="
echo "  METARDU - Starting container"
echo "=========================================="

if [ -z "${DATABASE_URL:-}" ] && { [ -z "${DB_HOST:-}" ] || [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ]; }; then
  echo "  FATAL: database connection settings are required; refusing to start without a verified schema." >&2
  exit 1
fi

echo ""
if [ ! -f /app/verify-migrations.mjs ]; then
  echo "  FATAL: Migration verifier is missing; application startup is blocked." >&2
  exit 1
fi
echo "  Verifying database schema using the restricted runtime role..."
if ! node /app/verify-migrations.mjs; then
  echo "  FATAL: Database schema verification failed; application startup is blocked." >&2
  exit 1
fi
echo ""

echo "Starting Next.js server..."
echo ""

# Start the Next.js server
exec node server.js
