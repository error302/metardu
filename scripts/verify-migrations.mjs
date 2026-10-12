#!/usr/bin/env node
/**
 * verify-migrations.mjs — post-deploy schema verification gate.
 *
 * This script compares the migrations directory (source of truth) against
 * the schema_migrations table (what the database actually has) and exits 1
 * on drift. In production it also proves the connected login is a restricted
 * runtime role, so an accidentally configured bootstrap/superuser URL cannot
 * make the app bypass row-level security.
 *
 * Checks:
 *   1. MISSING  — migration file with no schema_migrations row (never
 *                 applied, or applied and the row was lost)
 *   2. MUTATED  — applied row whose stored SHA-256 checksum no longer
 *                 matches the file (an already-applied migration was edited)
 *   3. GHOST    — schema_migrations row with no file (deleted migration)
 *
 * Exit codes: 0 = verified, 1 = drift/connection failure (fail closed),
 * 2 = usage error.
 *
 * Usage:
 *   node scripts/verify-migrations.mjs            # DATABASE_URL or DB_* vars
 *   MIGRATIONS_DIR=/tmp/mig node scripts/verify-migrations.mjs
 *
 * Pure logic is exported for tests (tests/verify-migrations.test.ts); the DB
 * I/O is a thin shell. Run inside the app container (has node + pg +
 * DATABASE_URL) — wired into .github/workflows/deploy.yml.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'

const MIGRATIONS_DIR = resolveMigrationsDir()

/** Preserve legacy raw hashes while tolerating only Git LF/CRLF conversion. */
export function migrationChecksums(content) {
  const hash = value => createHash('sha256').update(value).digest('hex')
  const lf = content.toString('utf8').replace(/\r\n/g, '\n')
  return { checksum: hash(content), equivalentChecksums: [hash(lf), hash(lf.replace(/\n/g, '\r\n'))] }
}

/**
 * Mirror migrate-unified.mjs's search order: env override, then the repo
 * checkout layout (src/lib/db/migrations), then the container layout where
 * the Dockerfile copies migrations to /app/migrations (the first deploy run
 * failed looking for /app/src/lib/db/migrations inside the image).
 */
function resolveMigrationsDir() {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR
  const candidates = [
    join(process.cwd(), 'src', 'lib', 'db', 'migrations'),
    join(process.cwd(), 'migrations'),
    '/app/migrations',
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

/** Migration file → { version, checksum } the same way migrate-unified.mjs does. */
export function collectFileMigrations(dir = MIGRATIONS_DIR) {
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return [] // caller decides how to treat an unreadable dir
  }
  return entries
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const filepath = join(dir, filename)
      return { version: filename.replace(/\.sql$/, ''), filename, ...migrationChecksums(readFileSync(filepath)) }
    })
}

/**
 * Pure drift computation — the part tests pin.
 *
 * @param {Array<{version: string, checksum: string}>} files  migrations on disk
 * @param {Array<{version: string, checksum: string | null}>} applied  schema_migrations rows
 * @returns {{missing: string[], mutated: Array<{version, stored, actual}>, ghost: string[], ok: boolean}}
 */
export function computeDrift(files, applied) {
  const appliedBy = new Map(applied.map((r) => [r.version, r]))
  const fileVersions = new Set(files.map((f) => f.version))

  const missing = files.filter((f) => !appliedBy.has(f.version)).map((f) => f.version)

  const mutated = []
  for (const f of files) {
    const row = appliedBy.get(f.version)
    // Rows without a stored checksum come from the legacy schema migration —
    // they cannot be verified, so treat them as verified-but-unverifiable
    // rather than drift (migrate-unified re-writes the checksum on --force).
    if (row && row.checksum && row.checksum !== f.checksum && !f.equivalentChecksums?.includes(row.checksum)) {
      mutated.push({ version: f.version, stored: row.checksum, actual: f.checksum })
    }
  }

  const ghost = applied
    .map((r) => r.version)
    .filter((v) => !fileVersions.has(v))

  return { missing, mutated, ghost, ok: missing.length === 0 && mutated.length === 0 && ghost.length === 0 }
}

/** Return a failure message when a production connection is not least-privilege. */
export function runtimeDatabaseRoleFailure(identity) {
  if (!identity || typeof identity !== 'object' || !identity.user_name) {
    return 'could not identify the connected database login.'
  }

  const elevated = [
    'rolsuper',
    'rolbypassrls',
    'rolcreatedb',
    'rolcreaterole',
    'rolreplication',
    'can_create_database',
    'can_create_in_public',
    'owns_public_objects',
    'can_mutate_migration_ledger',
  ].some((attribute) => identity[attribute] === true)
  if (elevated) {
    return 'production must connect with a non-owner, non-superuser role without BYPASSRLS, DDL privileges, or migration ledger write access.'
  }

  const memberships = Array.isArray(identity.memberships) ? identity.memberships : []
  if (!memberships.includes('authenticated') || memberships.some((role) => role !== 'authenticated')) {
    return 'the runtime login must belong only to the non-privileged authenticated compatibility role.'
  }
  if (identity.authenticated_role_safe !== true) {
    return 'the authenticated compatibility role is missing or has elevated attributes or memberships.'
  }

  return null
}

export const RUNTIME_ROLE_QUERY = `
  SELECT current_user AS user_name,
         role.rolsuper,
         role.rolbypassrls,
         role.rolcreatedb,
         role.rolcreaterole,
         role.rolreplication,
         has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database,
         has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public,
         EXISTS (
           SELECT 1
             FROM pg_class relation
             JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND pg_has_role(current_user, relation.relowner, 'USAGE')
         ) AS owns_public_objects,
         has_table_privilege(current_user, 'public.schema_migrations',
           'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS can_mutate_migration_ledger,
         COALESCE((
           SELECT array_agg(granted.rolname::text ORDER BY granted.rolname)
             FROM pg_auth_members membership
             JOIN pg_roles granted ON granted.oid = membership.roleid
            WHERE membership.member = role.oid
         ), ARRAY[]::text[]) AS memberships,
         COALESCE((
           SELECT NOT compatibility.rolsuper
                  AND NOT compatibility.rolbypassrls
                  AND NOT compatibility.rolcreatedb
                  AND NOT compatibility.rolcreaterole
                  AND NOT compatibility.rolreplication
                  AND NOT EXISTS (
                    SELECT 1 FROM pg_auth_members membership
                     WHERE membership.member = compatibility.oid
                  )
             FROM pg_roles compatibility
            WHERE compatibility.rolname = 'authenticated'
         ), false) AS authenticated_role_safe
    FROM pg_roles role
   WHERE role.rolname = current_user
`

function fail(msg) {
  console.error(`verify-migrations: FAIL — ${msg}`)
  process.exit(1)
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  const discreteDatabaseConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  }
  if (
    !databaseUrl &&
    !(discreteDatabaseConfig.host && discreteDatabaseConfig.database && discreteDatabaseConfig.user)
  ) {
    fail('DATABASE_URL or DB_HOST/DB_NAME/DB_USER is required — cannot verify schema state (fail closed).')
  }

  const files = collectFileMigrations(MIGRATIONS_DIR)
  if (files.length === 0) {
    fail(`no migration files found in ${MIGRATIONS_DIR} — refusing to "verify" against nothing.`)
  }

  const pool = new pg.Pool({
    ...(databaseUrl ? { connectionString: databaseUrl } : discreteDatabaseConfig),
    connectionTimeoutMillis: 10000,
  })
  let applied
  try {
    if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_RUNTIME_DATABASE_ROLE === 'true') {
      let identity
      try {
        const result = await pool.query(RUNTIME_ROLE_QUERY)
        identity = result.rows[0]
      } catch (err) {
        fail(`could not inspect the production database login (${err.message}).`)
      }
      const roleFailure = runtimeDatabaseRoleFailure(identity)
      if (roleFailure) fail(`unsafe production database login: ${roleFailure}`)
    }

    const res = await pool.query(
      'SELECT version, checksum FROM schema_migrations ORDER BY version'
    )
    applied = res.rows
  } catch (err) {
    fail(`could not read schema_migrations (${err.message}). If the table does not exist, NO migration has ever been recorded for this database.`)
  } finally {
    await pool.end().catch(() => {})
  }

  const drift = computeDrift(files, applied)

  if (drift.ok) {
    console.log(
      `verify-migrations: OK — ${files.length} migration(s) applied, checksums match, no ghosts.`
    )
    return
  }

  for (const v of drift.missing) {
    console.error(`  MISSING  ${v}.sql — file exists but was never applied (or its row was lost)`)
  }
  for (const m of drift.mutated) {
    console.error(
      `  MUTATED  ${m.version}.sql — applied checksum ${m.stored.slice(0, 12)}… ≠ file checksum ${m.actual.slice(0, 12)}… (an applied migration was edited — deploy a NEW migration instead)`
    )
  }
  for (const v of drift.ghost) {
    console.error(`  GHOST    schema_migrations has "${v}" but no such file exists on disk`)
  }
  fail(
    `${drift.missing.length} missing, ${drift.mutated.length} mutated, ${drift.ghost.length} ghost migration(s). ` +
      'The running schema does NOT match the migrations directory. Check container startup logs for a failed migration (the entrypoint only warns and continues).'
  )
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`verify-migrations: FAIL — ${e.message}`)
    process.exit(1)
  })
}
