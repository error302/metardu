#!/usr/bin/env node
/**
 * METARDU Database Migration Runner
 *
 * Runs SQL migration files from `src/lib/db/migrations/` in filename order,
 * tracking which have been applied in a `schema_migrations` table.
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/run-migrations.js                # Run all pending
 *   node scripts/run-migrations.js --dry-run       # Show what would run
 *   node scripts/run-migrations.js --status        # Show migration status
 *
 * Environment:
 *   DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD
 */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'lib', 'db', 'migrations')

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

function getClient() {
  if (process.env.DATABASE_URL) {
    return new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  }

  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'metardu',
    user: process.env.DB_USER || 'metardu',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  })
}

// ---------------------------------------------------------------------------
// Schema migrations table
// ---------------------------------------------------------------------------

/**
 * Create the tracking table if it does not exist.
 * Schema: id (serial PK), filename (unique), checksum (sha256), applied_at.
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      checksum    VARCHAR(64)  NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`)
    process.exit(1)
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      filename: f,
      filepath: path.join(MIGRATIONS_DIR, f),
    }))
}

/**
 * Compute SHA-256 hex digest of a file.
 */
function computeChecksum(filePath) {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Get the set of already-applied filenames (and their checksums).
 * Returns Map<filename, checksum>.
 */
async function getAppliedMigrations(client) {
  try {
    const { rows } = await client.query(
      'SELECT filename, checksum FROM schema_migrations ORDER BY applied_at'
    )
    const map = new Map()
    for (const row of rows) {
      map.set(row.filename, row.checksum)
    }
    return map
  } catch {
    // Table might not exist yet — return empty map
    return new Map()
  }
}

// ---------------------------------------------------------------------------
// Run a single migration
// ---------------------------------------------------------------------------

async function runMigration(client, migration, dryRun = false) {
  const sql = fs.readFileSync(migration.filepath, 'utf8')
  const checksum = computeChecksum(migration.filepath)

  if (dryRun) {
    console.log(`  [DRY RUN] Would apply: ${migration.filename}  (sha256: ${checksum.slice(0, 12)}…)`)
    return
  }

  console.log(`  Applying: ${migration.filename} …`)

  try {
    await client.query('BEGIN')
    await client.query(sql)

    // Record successful migration (id is auto-generated, ON CONFLICT upserts)
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum)
       VALUES ($1, $2)
       ON CONFLICT (filename) DO UPDATE SET checksum = $2, applied_at = NOW()`,
      [migration.filename, checksum]
    )

    await client.query('COMMIT')
    console.log(`  ✓ Applied: ${migration.filename}  (sha256: ${checksum.slice(0, 12)}…)`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(`  ✗ FAILED: ${migration.filename}`)
    console.error(`    Error: ${err.message}`)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const showStatus = args.includes('--status')

  const client = getClient()

  try {
    await client.connect()
    console.log('Connected to database.')

    await ensureMigrationsTable(client)

    const allMigrations = getMigrationFiles()
    const applied = await getAppliedMigrations(client)

    // --- --status -----------------------------------------------------------
    if (showStatus) {
      console.log('\nMigration Status:')
      console.log('─────────────────────────────────────────────────────────────')
      for (const m of allMigrations) {
        const checksum = computeChecksum(m.filepath)
        const appliedChecksum = applied.get(m.filename)
        const isApplied = !!appliedChecksum

        let marker = '○' // pending
        if (isApplied) {
          if (appliedChecksum === checksum) {
            marker = '✓' // applied, checksum matches
          } else {
            marker = '⚠' // applied, but checksum differs (file was modified)
          }
        }

        const status = isApplied
          ? appliedChecksum === checksum
            ? '(applied)'
            : `(applied — checksum mismatch! stored: ${appliedChecksum!.slice(0, 12)}…)`
          : '(pending)'

        console.log(`  ${marker} ${m.filename}  ${status}`)
      }
      const appliedCount = [...applied.values()].filter((c) =>
        allMigrations.some((m) => applied.get(m.filename) === computeChecksum(m.filepath))
      ).length
      console.log(
        `\n  Total: ${allMigrations.length}, Applied: ${applied.size}, Pending: ${allMigrations.length - applied.size}`
      )
      return
    }

    // --- Normal run ---------------------------------------------------------
    // Skip migrations already applied with matching checksum
    const pending = allMigrations.filter((m) => {
      const existing = applied.get(m.filename)
      if (!existing) return true // never applied
      const current = computeChecksum(m.filepath)
      if (existing === current) return false // already applied, checksum matches
      // Checksum differs — warn but skip (user must handle manually)
      console.warn(
        `  ⚠ WARNING: ${m.filename} was previously applied but the file has changed.\n` +
        `    Stored checksum: ${existing.slice(0, 12)}…\n` +
        `    Current checksum: ${current.slice(0, 12)}…\n` +
        `    Skipping. To re-apply, delete the row from schema_migrations first.`
      )
      return false
    })

    if (pending.length === 0) {
      console.log('No pending migrations.')
      return
    }

    console.log(`\nFound ${pending.length} pending migration(s):\n`)

    for (const migration of pending) {
      await runMigration(client, migration, dryRun)
    }

    if (!dryRun) {
      console.log(`\n✓ All ${pending.length} migration(s) applied successfully.`)
    } else {
      console.log(`\nDry run complete — no changes were made.`)
    }
  } catch (err) {
    console.error('\nMigration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
