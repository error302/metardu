# Archived Legacy SQL Migrations

**Do NOT run these scripts.** They are kept for reference only.

These scripts predate the canonical migration system (`src/lib/db/migrations/`).
They use deprecated patterns:
- `auth.uid()` (Supabase Auth, no longer used — we use `current_user_id()`)
- SERIAL primary keys (canonical schema uses UUID)
- `owner_id` columns (canonical schema uses `user_id`)
- Direct `CREATE TABLE` without idempotent guards

The canonical migration system lives at:
- `src/lib/db/migrations/000_canonical_schema.sql` — All 37 tables
- `src/lib/db/migrations/001_rbac_fixed.sql` — RBAC functions
- `src/lib/db/migrations/002_rls_fixed.sql` — RLS policies
- `src/lib/db/migrations/003_rls_missing_tables.sql` — Missing RLS policies

To run migrations: `npx tsx scripts/migrate.ts`
