const { execSync } = require('child_process');

/**
 * Database setup script — now uses the migration runner.
 * This is a convenience wrapper that runs the migration system.
 *
 * Usage:
 *   node scripts/setup-database.js            # Run all pending migrations
 *   node scripts/setup-database.js --status   # Show migration status
 *   node scripts/setup-database.js --dry-run  # Dry run
 */

const args = process.argv.slice(2).join(' ');

console.log('METARDU Database Setup');
console.log('=====================\n');

try {
  const command = args ? `node scripts/run-migrations.js ${args}` : 'node scripts/run-migrations.js';
  execSync(command, { stdio: 'inherit', cwd: process.cwd() });
} catch (err) {
  console.error('Database setup failed. See errors above.');
  process.exit(1);
}
