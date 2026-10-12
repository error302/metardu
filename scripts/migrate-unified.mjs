#!/usr/bin/env node
/**
 * METARDU Unified Migration Runner
 * ==================================
 * Consolidates the 3+ fragmented migration systems into one reliable tool.
 *
 * Uses `schema_migrations` as the SINGLE tracking table with the schema:
 *   version    TEXT PRIMARY KEY   (filename without .sql extension)
 *   applied_at TIMESTAMPTZ DEFAULT NOW()
 *   checksum   TEXT               (SHA-256 hex digest)
 *
 * Backward-compatible: if an existing `schema_migrations` table uses the
 * older `filename` column (from run-migrations.js), it is migrated in-place.
 *
 * Usage:
 *   node scripts/migrate-unified.mjs                      # Apply all pending
 *   node scripts/migrate-unified.mjs --dry-run             # Show what would be applied
 *   node scripts/migrate-unified.mjs --force               # Re-apply even if tracked
 *   node scripts/migrate-unified.mjs --rollback <version>  # Run DOWN section
 *   node scripts/migrate-unified.mjs --status              # Show migration status
 *
 * Environment:
 *   DATABASE_URL — PostgreSQL connection string (required)
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { fileURLToPath, pathToFileURL } from 'url'
import pg from 'pg'
import { migrationChecksums } from './verify-migrations.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Look for migrations in multiple locations (Docker copies to ./migrations)
const MIGRATION_SEARCH_DIRS = [
  join(__dirname, '..', 'src', 'lib', 'db', 'migrations'),
  join(process.cwd(), 'src', 'lib', 'db', 'migrations'),
  join(process.cwd(), 'migrations'),
  '/app/migrations',
]

let MIGRATIONS_DIR = null
for (const dir of MIGRATION_SEARCH_DIRS) {
  if (existsSync(dir)) {
    MIGRATIONS_DIR = dir
    break
  }
}

// ── CLI Argument Parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const SHOW_STATUS = args.includes('--status')
const ROLLBACK_IDX = args.indexOf('--rollback')
const ROLLBACK_TARGET = ROLLBACK_IDX !== -1 ? args[ROLLBACK_IDX + 1] : null

// ── Timestamped Logger ───────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`)
}

function warn(msg) {
  console.warn(`[${ts()}] WARNING: ${msg}`)
}

function error(msg) {
  console.error(`[${ts()}] ERROR: ${msg}`)
}

// ── Database Connection ──────────────────────────────────────────────────────

function getDatabaseUrl() {
  // Try process.env first
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  // Try .env.local
  const envLocal = join(process.cwd(), '.env.local')
  if (existsSync(envLocal)) {
    const content = readFileSync(envLocal, 'utf8')
    const match = content.match(/^DATABASE_URL=["']?(.*?)["']?\s*$/m)
    if (match) return match[1]
  }

  // Try .env
  const envFile = join(process.cwd(), '.env')
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf8')
    const match = content.match(/^DATABASE_URL=["']?(.*?)["']?\s*$/m)
    if (match) return match[1]
  }

  error('DATABASE_URL not found. Set it in environment, .env.local, or .env')
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMigrationFiles() {
  if (!MIGRATIONS_DIR || !existsSync(MIGRATIONS_DIR)) {
    error(`Migrations directory not found. Checked: ${MIGRATION_SEARCH_DIRS.join(', ')}`)
    process.exit(1)
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => ({
      filename: f,
      version: f.replace(/\.sql$/, ''),
      filepath: join(MIGRATIONS_DIR, f),
    }))
}

function computeChecksum(filePath) {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

export function assertMigrationChecksum(filePath, storedChecksum) {
  const { checksum, equivalentChecksums } = migrationChecksums(readFileSync(filePath))
  if (storedChecksum && storedChecksum !== checksum && !equivalentChecksums.includes(storedChecksum)) {
    throw new Error(`Applied migration content changed: ${filePath}. Add a new migration instead of editing applied SQL.`)
  }
}

function checksumMatches(filePath, storedChecksum) {
  try { assertMigrationChecksum(filePath, storedChecksum); return true } catch { return false }
}

/**
 * Extract the DOWN section from a migration SQL file.
 * Supports these patterns:
 *   -- DOWN: <description>
 *   -- DOWN (manual rollback...)
 *   -- DOWN
 * Everything after the DOWN marker until end of file (or next -- ═ divider) is the DOWN SQL.
 */
function extractDownSql(sql) {
  // Match "-- DOWN" marker (with optional trailing text on same line)
  // Then capture everything until end of file or a ═ divider line
  const downMatch = sql.match(/--\s*DOWN.*?\n([\s\S]*?)(?:--\s*═|$)/i)
  if (!downMatch) return null

  const downSql = downMatch[1].trim()
  if (!downSql) return null

  // Filter out comment-only lines (lines that are just SQL comments)
  const executableLines = downSql.split('\n').filter(line => {
    const trimmed = line.trim()
    return trimmed && !trimmed.startsWith('--')
  })

  if (executableLines.length === 0) return null
  return downSql
}

/** Extract the forward-only section so rollback SQL never runs during apply. */
function extractUpSql(sql) {
  const downMarker = /^\s*--\s*DOWN\b[^\r\n]*$/im.exec(sql)
  return (downMarker ? sql.slice(0, downMarker.index) : sql).trim()
}

// ── Schema Migrations Table Management ───────────────────────────────────────

/**
 * Ensure Supabase-compatibility roles (`authenticated`, `anon`,
 * `service_role`) exist. Some migrations (e.g. 044_boundary_monuments.sql)
 * still GRANT to the `authenticated` role, which only exists in a
 * Supabase-hosted Postgres. A fresh plain-Postgres deploy fails with
 * `role "authenticated" does not exist` without this bootstrap step.
 */
async function ensureCompatibilityRoles(pool) {
  for (const role of ['authenticated', 'anon', 'service_role']) {
    const { rows } = await pool.query(
      'SELECT 1 FROM pg_roles WHERE rolname = $1',
      [role]
    )
    if (rows.length === 0) {
      await pool.query(`CREATE ROLE "${role}"`)
      log(`Created compatibility role: ${role}`)
    }
  }
}

/**
 * Ensure the schema_migrations table exists with the canonical schema.
 * If the table already exists with an older schema (e.g., using `filename`
 * instead of `version`, or missing `checksum`), migrate it in-place.
 */
async function ensureMigrationsTable(pool) {
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
  )

  if (tables.length === 0) {
    // Create with canonical schema
    log('Creating schema_migrations table...')
    await pool.query(`
      CREATE TABLE schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum   TEXT
      )
    `)
    log('schema_migrations table created.')
    return
  }

  // Table exists — check its columns
  const { rows: columns } = await pool.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'schema_migrations'
     ORDER BY ordinal_position`
  )

  const colNames = new Set(columns.map(c => c.column_name))

  // Case 1: Old schema uses `filename` instead of `version` (from run-migrations.js)
  if (colNames.has('filename') && !colNames.has('version')) {
    log('Migrating schema_migrations from `filename` to `version` column...')

    // Get existing data
    const { rows: existing } = await pool.query(
      'SELECT filename, checksum, applied_at FROM schema_migrations'
    )

    // Drop and recreate with correct schema
    await pool.query('DROP TABLE schema_migrations')
    await pool.query(`
      CREATE TABLE schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum   TEXT
      )
    `)

    // Re-insert with transformed version (strip .sql extension)
    for (const row of existing) {
      const version = row.filename.replace(/\.sql$/, '')
      await pool.query(
        'INSERT INTO schema_migrations (version, applied_at, checksum) VALUES ($1, $2, $3)',
        [version, row.applied_at, row.checksum]
      )
    }

    log(`Migrated ${existing.length} existing migration record(s).`)
    return
  }

  // Case 2: Schema from migrate.ts — has `version` but no `checksum`
  if (colNames.has('version') && !colNames.has('checksum')) {
    log('Adding checksum column to schema_migrations...')
    await pool.query('ALTER TABLE schema_migrations ADD COLUMN checksum TEXT')
    log('Checksum column added.')
    return
  }

  // Case 3: Already has the canonical schema
  if (colNames.has('version') && colNames.has('checksum')) {
    log('schema_migrations table is up to date.')
    return
  }

  // Case 4: Unknown schema — warn and proceed
  warn('schema_migrations table has unexpected schema. Proceeding with caution.')
}

/**
 * Get applied migrations as a Map<version, { checksum, applied_at }>.
 */
export async function getAppliedMigrations(pool) {
  // Read the tracker shape instead of treating every query failure as an
  // empty database. In particular, DNS/authentication failures must make a
  // dry run fail, and legacy `filename` trackers should still be readable.
  const { rows: columns } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
  )
  if (columns.length === 0) return new Map()

  const columnNames = new Set(columns.map(row => row.column_name))
  const versionColumn = columnNames.has('version') ? 'version' : columnNames.has('filename') ? 'filename' : null
  if (!versionColumn) throw new Error('schema_migrations has an unsupported schema; inspect it before running migrations.')
  const checksumColumn = columnNames.has('checksum') ? 'checksum' : 'NULL AS checksum'
  const appliedColumn = columnNames.has('applied_at') ? 'applied_at' : 'NULL AS applied_at'
  const { rows } = await pool.query(
    `SELECT ${versionColumn} AS version, ${checksumColumn}, ${appliedColumn}
     FROM public.schema_migrations ORDER BY ${versionColumn}`
  )
  const map = new Map()
  for (const row of rows) {
    map.set(String(row.version).replace(/\.sql$/, ''), { checksum: row.checksum, applied_at: row.applied_at })
  }
  return map
}

// ── Core Operations ──────────────────────────────────────────────────────────

/**
 * Apply a single migration.
 */
async function applyMigration(pool, migration, dryRun = false, force = false) {
  const sql = readFileSync(migration.filepath, 'utf8')
  const upSql = extractUpSql(sql)
  const checksum = computeChecksum(migration.filepath)

  if (!upSql) {
    error(`No UP SQL found in ${migration.filename}`)
    process.exit(1)
  }

  if (dryRun) {
    log(`[DRY RUN] Would apply: ${migration.filename}  (sha256: ${checksum.slice(0, 12)}…)`)
    return
  }

  log(`Applying: ${migration.filename} …`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Run the migration SQL
    await client.query(upSql)

    // Record as applied (use ON CONFLICT for --force re-applies)
    await client.query(
      `INSERT INTO schema_migrations (version, checksum)
       VALUES ($1, $2)
       ON CONFLICT (version) DO UPDATE SET checksum = $2, applied_at = NOW()`,
      [migration.version, checksum]
    )

    await client.query('COMMIT')
    log(`Applied: ${migration.filename}  (sha256: ${checksum.slice(0, 12)}…)`)
  } catch (err) {
    await client.query('ROLLBACK')
    error(`FAILED: ${migration.filename}`)
    error(`  ${err.message}`)
    if (err.position) {
      const lines = sql.split('\n')
      let charPos = 0
      for (let i = 0; i < lines.length; i++) {
        if (charPos + lines[i].length + 1 > Number(err.position)) {
          error(`  Near line ${i + 1}: ${lines[i].trim()}`)
          break
        }
        charPos += lines[i].length + 1
      }
    }
    throw err
  } finally {
    client.release()
  }
}

/**
 * Roll back a specific migration by running its DOWN section.
 */
async function rollbackMigration(pool, migration, dryRun = false) {
  const sql = readFileSync(migration.filepath, 'utf8')
  const downSql = extractDownSql(sql)

  if (!downSql) {
    error(`No DOWN section found in ${migration.filename}`)
    error('Add a "-- DOWN:" section with rollback SQL to enable rollback.')
    process.exit(1)
  }

  if (dryRun) {
    log(`[DRY RUN] Would rollback: ${migration.filename}`)
    console.log(`  DOWN SQL:\n${downSql}`)
    return
  }

  log(`Rolling back: ${migration.filename} …`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(downSql)
    await client.query(
      'DELETE FROM schema_migrations WHERE version = $1',
      [migration.version]
    )
    await client.query('COMMIT')
    log(`Rolled back: ${migration.filename}`)
  } catch (err) {
    await client.query('ROLLBACK')
    error(`FAILED to rollback: ${migration.filename}`)
    error(`  ${err.message}`)
    throw err
  } finally {
    client.release()
  }
}

/**
 * Show migration status.
 */
async function showStatus(pool, allMigrations, applied) {
  console.log('')
  console.log('Migration Status:')
  console.log('─'.repeat(70))

  let appliedCount = 0
  let pendingCount = 0
  let mismatchCount = 0

  for (const m of allMigrations) {
    const currentChecksum = computeChecksum(m.filepath)
    const record = applied.get(m.version)

    let marker = '○' // pending
    let status = '(pending)'

    if (record) {
      if (!checksumMatches(m.filepath, record.checksum)) {
        marker = '⚠'
        status = `(checksum mismatch! stored: ${(record.checksum || '').slice(0, 12)}…)`
        mismatchCount++
      } else {
        marker = '✓'
        status = `(applied ${record.applied_at ? new Date(record.applied_at).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '') : ''})`
      }
      appliedCount++
    } else {
      pendingCount++
    }

    console.log(`  ${marker} ${m.filename}  ${status}`)
  }

  console.log('')
  console.log(`  Total: ${allMigrations.length}  |  Applied: ${appliedCount}  |  Pending: ${pendingCount}  |  Mismatch: ${mismatchCount}`)
  console.log('')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = getDatabaseUrl()

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
    query_timeout: 120000,
  })

  try {
    log('Connecting with configured database settings.')
    log(`Migrations dir: ${MIGRATIONS_DIR}`)
    console.log('')

    // A dry run must be read-only. The normal bootstrap helpers create or
    // alter the migration table and roles, so only run them during an apply.
    // getAppliedMigrations below safely returns an empty map when history is
    // unavailable, allowing dry runs against a new database without writes.
    if (!DRY_RUN) {
      await ensureMigrationsTable(pool)
      await ensureCompatibilityRoles(pool)
    } else {
      log('Dry run is read-only: skipping migration-table and role bootstrap.')
    }

    // Get all migration files and already-applied records
    const allMigrations = getMigrationFiles()
    const applied = await getAppliedMigrations(pool)
    log('Connected to database and read migration history.')

    if (allMigrations.length === 0) {
      log('No migration files found.')
      process.exit(0)
    }

    // ── --rollback <version> ──────────────────────────────────────────
    if (ROLLBACK_TARGET) {
      const migration = allMigrations.find(m =>
        m.version === ROLLBACK_TARGET ||
        m.filename === ROLLBACK_TARGET ||
        m.version.startsWith(ROLLBACK_TARGET)
      )

      if (!migration) {
        error(`Migration not found: ${ROLLBACK_TARGET}`)
        error('Available migrations:')
        for (const m of allMigrations) error(`  ${m.filename}`)
        process.exit(1)
      }

      if (!applied.has(migration.version)) {
        error(`Migration not applied: ${migration.filename}`)
        process.exit(1)
      }

      await rollbackMigration(pool, migration, DRY_RUN)
      return
    }

    // ── --status ──────────────────────────────────────────────────────
    if (SHOW_STATUS) {
      await showStatus(pool, allMigrations, applied)
      return
    }

    // ── Normal run (apply pending migrations) ─────────────────────────
    const pending = []

    for (const m of allMigrations) {
      const record = applied.get(m.version)

      if (!record) {
        // Never applied
        pending.push(m)
        continue
      }

      if (FORCE) {
        // --force: re-apply even if tracked
        const currentChecksum = computeChecksum(m.filepath)
        if (!checksumMatches(m.filepath, record.checksum)) {
          warn(`${m.filename} was previously applied but file has changed — re-applying with --force`)
        } else {
          log(`${m.filename} already applied — re-applying with --force`)
        }
        pending.push(m)
        continue
      }

      // Already applied — check checksum
      assertMigrationChecksum(m.filepath, record.checksum)
      // else: already applied with matching checksum — skip silently
    }

    if (pending.length === 0) {
      log('All migrations up to date — no pending migrations.')
      return
    }

    console.log(`Found ${pending.length} pending migration(s):\n`)

    for (const migration of pending) {
      await applyMigration(pool, migration, DRY_RUN, FORCE)
    }

    console.log('')
    if (DRY_RUN) {
      log('Dry run complete — no changes were made.')
    } else {
      log(`All ${pending.length} migration(s) applied successfully.`)
    }
  } catch (err) {
    console.log('')
    error('Migration failed.')
    error(err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
