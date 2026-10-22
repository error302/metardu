#!/usr/bin/env node
/**
 * Retired filename/checksum migration entry point.
 *
 * The supported runner is migrate-unified.mjs. Do not silently forward older
 * deployment scripts: database ownership, backups, immutable checksums and the
 * app/migrator artifact must be reviewed before applying a release.
 */
console.error('ERROR: scripts/run-migrations.js is retired. No database was contacted.')
console.error('Use npm run migrate:status or npm run migrate:dry-run for the supported unified runner.')
console.error('Apply a reviewed migration plan with npm run migrate only after the documented release checks.')
console.error('See docs/DOCKER_RUNTIME_WORKFLOW.md. Do not delete ledger rows or change applied checksums.')
process.exitCode = 2
