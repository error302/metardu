#!/usr/bin/env node
/**
 * METARDU Database Migration Runner (Node.js — pg client)
 * ========================================================
 * Applies SQL migrations in order and tracks them in a _migrations table.
 * Uses the `pg` Node.js module directly — no psql dependency needed.
 * Designed to be called from the Docker entrypoint before the app starts.
 *
 * Usage:
 *   node migrate.js                # Apply all pending migrations
 *   node migrate.js --dry-run      # Show what would be applied
 *   node migrate.js --check        # Exit 0 if up-to-date, 1 if pending
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');
const CHECK_ONLY = process.argv.includes('--check');

// Resolve DATABASE_URL
let dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl) {
  const envLocal = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envLocal)) {
    const content = fs.readFileSync(envLocal, 'utf8');
    const match = content.match(/^DATABASE_URL=["']?(.*?)["']?\s*$/m);
    if (match) dbUrl = match[1];
  }
}
if (!dbUrl) {
  const envFile = path.join(process.cwd(), '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    const match = content.match(/^DATABASE_URL=["']?(.*?)["']?\s*$/m);
    if (match) dbUrl = match[1];
  }
}
if (!dbUrl) {
  console.error('DATABASE_URL not found. Set it in environment or .env.local');
  process.exit(1);
}

// Look for migrations in multiple locations:
const migrationDirs = [
  path.join(process.cwd(), 'migrations'),
  path.join(process.cwd(), 'src/lib/db/migrations'),
  '/app/migrations',
];

let migrationDir = null;
for (const dir of migrationDirs) {
  if (fs.existsSync(dir)) {
    migrationDir = dir;
    break;
  }
}

if (!migrationDir) {
  console.error('Migration directory not found. Checked:', migrationDirs.join(', '));
  process.exit(1);
}

async function runMigrations() {
  // Dynamically import pg
  let pg;
  try {
    pg = require('pg');
  } catch {
    // In standalone Docker build, pg might be in node_modules at /app
    try {
      pg = require(path.join(process.cwd(), 'node_modules/pg'));
    } catch {
      console.error('pg module not found. Install it: npm install pg');
      process.exit(1);
    }
  }

  const pool = new pg.Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
    query_timeout: 60000,
  });

  try {
    console.log('Migration directory:', migrationDir);
    console.log('Database:', dbUrl.replace(/:[^:@]*@/, ':***@'));
    console.log();

    // Create tracking table
    console.log('Ensuring _migrations table exists...');
    if (!DRY_RUN) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id          SERIAL PRIMARY KEY,
          name        VARCHAR(255) NOT NULL UNIQUE,
          applied_at  TIMESTAMPTZ DEFAULT NOW(),
          checksum    VARCHAR(64)
        );
      `);
    }

    // Get applied migrations
    let applied = new Set();
    if (!DRY_RUN) {
      try {
        const result = await pool.query('SELECT name FROM _migrations ORDER BY name');
        applied = new Set(result.rows.map((r) => r.name));
      } catch {
        // Table doesn't exist yet — will be empty
      }
    }

    // Find SQL files and sort
    const files = fs.readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let pending = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  Already applied: ${file}`);
        continue;
      }

      console.log(`  Applying: ${file}`);
      pending++;

      if (CHECK_ONLY) continue;

      const filePath = path.join(migrationDir, file);
      const checksum = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
      const sql = fs.readFileSync(filePath, 'utf8');

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would apply: ${file}`);
        continue;
      }

      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query(
          'INSERT INTO _migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [file, checksum]
        );
        await pool.query('COMMIT');
        console.log(`  Applied: ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Failed: ${file} — ${message}`);
        console.error('Stopping migration. Fix the error and re-run.');
        process.exit(1);
      }
    }

    console.log();
    if (CHECK_ONLY) {
      if (pending > 0) {
        console.log(`${pending} pending migration(s)`);
        process.exit(1);
      } else {
        console.log('All migrations up to date');
        process.exit(0);
      }
    } else if (pending === 0) {
      console.log('All migrations up to date — no pending migrations');
    } else {
      console.log(`Applied ${pending} migration(s)`);
    }
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration runner error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
