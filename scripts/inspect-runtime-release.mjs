// Execute over stdin inside the running app. Read-only metadata only; never
// print environment values or inspect customer/project observation rows.
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(path.join(process.cwd(), 'package.json'))
const { Pool } = require('pg')
const pool = new Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  }), connectionTimeoutMillis: 5000, statement_timeout: 5000,
})
try {
  const { rows: [role] } = await pool.query(`SELECT current_user AS name,
    rolsuper AS superuser, rolbypassrls AS bypass_rls, rolcreaterole AS create_role,
    rolcreatedb AS create_database FROM pg_roles WHERE rolname = current_user`)
  const { rows: columns } = await pool.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'`)
  const names = new Set(columns.map(row => row.column_name))
  const versionColumn = names.has('version') ? 'version' : names.has('filename') ? 'filename' : null
  let migrations = []
  if (versionColumn) {
    const result = await pool.query(`SELECT ${versionColumn} AS version,
      ${names.has('checksum') ? 'checksum' : 'NULL::text AS checksum'} FROM public.schema_migrations ORDER BY ${versionColumn}`)
    migrations = result.rows.map(row => ({ ...row, version: row.version.replace(/\.sql$/, '') }))
  }
  const { rows: rowSecurity } = await pool.query(`SELECT relname AS table, relrowsecurity AS enabled,
    relforcerowsecurity AS forced FROM pg_class JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE nspname = 'public' AND relname IN ('projects', 'setout_definitions', 'setout_observations', 'design_revisions')`)
  const { rows: [capture] } = await pool.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'setout_observations' AND column_name = 'capture_snapshot') AS present`)
  const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID')
  console.log(JSON.stringify({ node: process.versions.node, buildId: existsSync(buildIdPath) ? readFileSync(buildIdPath, 'utf8').trim() : null,
    role, migrationVersionColumn: versionColumn, migrations, rowSecurity, captureSnapshotColumn: capture.present }))
} finally { await pool.end() }
