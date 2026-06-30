#!/usr/bin/env node
/**
 * METARDU Migration Creator
 *
 * Creates a new timestamped SQL migration file.
 *
 * Usage:
 *   node scripts/migrate-create.js add_foo_column
 *   → creates src/lib/db/migrations/015_add_foo_column.sql
 *
 * The file is pre-filled with a template including:
 *   - Header comment with timestamp + description
 *   - -- UP: section for forward migration
 *   - -- DOWN: section for rollback (not yet auto-applied, but documented)
 */

const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'lib', 'db', 'migrations')

// Get description from args
const description = process.argv[2]
if (!description) {
  console.error('Usage: node scripts/migrate-create.js <description_in_snake_case>')
  console.error('Example: node scripts/migrate-create.js add_parcel_count_column')
  process.exit(1)
}

// Find next number
const existing = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .map(f => parseInt(f.split('_')[0], 10))
  .filter(n => !isNaN(n))

const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 0
const paddedNum = String(nextNum).padStart(3, '0')
const filename = `${paddedNum}_${description}.sql`
const filepath = path.join(MIGRATIONS_DIR, filename)

// Template
const template = `-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: ${description}
-- Created: ${new Date().toISOString()}
-- ═══════════════════════════════════════════════════════════════════════════════

-- UP: Forward migration (applied on 'npm run migrate')
-- Add your ALTER TABLE / CREATE TABLE / CREATE INDEX statements here.


-- DOWN: Rollback (not auto-applied — run manually if needed)
-- Add the reverse of your UP statements here.
-- Example: ALTER TABLE projects DROP COLUMN foo;

`

fs.writeFileSync(filepath, template)
console.log(`✓ Created: src/lib/db/migrations/${filename}`)
console.log(`  Edit the file, then run: npm run migrate`)
