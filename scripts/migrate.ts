#!/usr/bin/env npx tsx
/**
 * Metardu Database Migration Runner
 *
 * Reads all .sql files from src/lib/db/migrations/ in sorted order,
 * tracks applied migrations in schema_migrations table,
 * and runs pending migrations inside transactions.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts
 *
 * Environment:
 *   DATABASE_URL — PostgreSQL connection string (from .env.local or env)
 */

import { Pool } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// ── Configuration ──────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'lib', 'db', 'migrations')

/** Load DATABASE_URL from .env.local if available, otherwise from process.env */
function getDatabaseUrl(): string {
  // Try process.env first (may already be set by CI/CD)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  // Try reading .env.local
  try {
    const envPath = join(__dirname, '..', '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    const match = envContent.match(/^DATABASE_URL\s*=\s*["']?(.+?)["']?\s*$/m)
    if (match) {
      return match[1]
    }
  } catch {
    // .env.local doesn't exist or can't be read — fall through
  }

  console.error(
    'ERROR: DATABASE_URL not found.\n' +
    'Set it in .env.local or as an environment variable.'
  )
  process.exit(1)
}

// ── Migration Runner ───────────────────────────────────────────────────────────

async function runMigrations() {
  const databaseUrl = getDatabaseUrl()
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    // 1. Ensure schema_migrations table exists
    console.log('🔄 Ensuring schema_migrations table exists...')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // 2. Read already-applied migrations
    const { rows: applied } = await pool.query(
      'SELECT version FROM schema_migrations'
    )
    const appliedVersions = new Set(applied.map((r) => r.version))

    // 3. List and sort migration files
    let files: string[]
    try {
      files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log('📂 No migrations directory found at', MIGRATIONS_DIR)
        console.log('   Nothing to migrate.')
        return
      }
      throw err
    }

    if (files.length === 0) {
      console.log('📂 No migration files found.')
      return
    }

    // 4. Filter to pending migrations
    const pending = files.filter((f) => {
      const version = f.replace(/\.sql$/, '')
      return !appliedVersions.has(version)
    })

    if (pending.length === 0) {
      console.log('✅ All migrations already applied.')
      return
    }

    console.log(`📋 Found ${pending.length} pending migration(s):`)
    for (const f of pending) {
      console.log(`   - ${f}`)
    }

    // 5. Apply each pending migration in its own transaction
    for (const file of pending) {
      const version = file.replace(/\.sql$/, '')
      const filePath = join(MIGRATIONS_DIR, file)
      const sql = readFileSync(filePath, 'utf-8')

      console.log(`\n⏳ Applying migration: ${file} ...`)

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Run the migration SQL
        await client.query(sql)

        // Record it as applied
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        )

        await client.query('COMMIT')
        console.log(`✅ Applied: ${file}`)
      } catch (err: any) {
        await client.query('ROLLBACK')
        console.error(`\n❌ Migration FAILED: ${file}`)
        console.error(`   Error: ${err.message}`)
        if (err.position) {
          const lines = sql.split('\n')
          let charPos = 0
          for (let i = 0; i < lines.length; i++) {
            if (charPos + lines[i].length + 1 > Number(err.position)) {
              console.error(`   Near line ${i + 1}: ${lines[i].trim()}`)
              break
            }
            charPos += lines[i].length + 1
          }
        }
        console.error('\n🛑 Stopping. Fix the migration and re-run.')
        process.exit(1)
      } finally {
        client.release()
      }
    }

    console.log(`\n🎉 All ${pending.length} migration(s) applied successfully.`)
  } finally {
    await pool.end()
  }
}

// ── Entry Point ────────────────────────────────────────────────────────────────

runMigrations().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
