#!/usr/bin/env node
/**
 * One-shot database bootstrap for Docker deployments.
 *
 * The migration container alone receives the PostgreSQL bootstrap password.
 * The web container receives only the non-owner, non-superuser login created
 * here. Migrations are still owned/applied by migrate-unified.mjs.
 */

import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))

const ROLE_NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/i

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function postgresConnectionString({ host, port, database, user, password }) {
  const address = new URL('postgresql://localhost')
  address.hostname = host
  address.port = String(port)
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${address.host}/${encodeURIComponent(database)}`
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required by the database migration service.`)
  return value
}

function readConfig(prefix) {
  const port = Number(required(`${prefix}_DB_PORT`))
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${prefix}_DB_PORT must be an integer between 1 and 65535.`)
  }
  return {
    host: required(`${prefix}_DB_HOST`),
    port,
    database: required(`${prefix}_DB_NAME`),
    user: required(`${prefix}_DB_USER`),
    password: required(`${prefix}_DB_PASSWORD`),
  }
}

function validateRoleName(name, label) {
  if (!ROLE_NAME_RE.test(name)) {
    throw new Error(`${label} must be a simple PostgreSQL role identifier (letters, digits, underscores).`)
  }
  return name
}

async function ensureRuntimeRole(adminPool, appRole, appPassword, database) {
  const identifier = quoteIdentifier(appRole)
  const password = `'${appPassword.replaceAll("'", "''")}'`
  const existing = await adminPool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appRole])

  if (existing.rowCount === 0) {
    await adminPool.query(
      `CREATE ROLE ${identifier} WITH LOGIN PASSWORD ${password} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    )
  } else {
    await adminPool.query(
      `ALTER ROLE ${identifier} WITH LOGIN PASSWORD ${password} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`,
    )
  }

  const memberships = await adminPool.query(
    `SELECT granted.rolname, granted.rolsuper, granted.rolbypassrls
       FROM pg_auth_members membership
       JOIN pg_roles member ON member.oid = membership.member
       JOIN pg_roles granted ON granted.oid = membership.roleid
      WHERE member.rolname = $1`,
    [appRole],
  )
  const unexpectedMemberships = memberships.rows.filter((row) => row.rolname !== 'authenticated')
  if (unexpectedMemberships.length > 0) {
    throw new Error(
      `Runtime role ${appRole} already has unexpected memberships (${unexpectedMemberships.map((row) => row.rolname).join(', ')}); remove them before deployment.`,
    )
  }

  await adminPool.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${identifier}`)
}

async function grantRuntimePrivileges(adminPool, migrationUser, appRole, database) {
  const migrationIdentifier = quoteIdentifier(migrationUser)
  const appIdentifier = quoteIdentifier(appRole)
  const databaseIdentifier = quoteIdentifier(database)

  const authenticated = await adminPool.query(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'authenticated'`,
  )
  if (authenticated.rowCount !== 1) {
    throw new Error('Migration compatibility role "authenticated" was not created.')
  }
  if (authenticated.rows[0].rolsuper || authenticated.rows[0].rolbypassrls) {
    throw new Error('The "authenticated" role has elevated database attributes; refusing to grant it to the runtime login.')
  }

  await adminPool.query(`GRANT authenticated TO ${appIdentifier}`)
  await adminPool.query(`GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${appIdentifier}`)
  await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${appIdentifier}`)
  await adminPool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appIdentifier}`,
  )
  await adminPool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appIdentifier}`)
  await adminPool.query(`GRANT SELECT ON TABLE public.schema_migrations TO ${appIdentifier}`)
  await adminPool.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.schema_migrations FROM ${appIdentifier}`,
  )

  // Keep future migration-created tables usable without making the runtime
  // login an owner or granting it schema/role administration.
  await adminPool.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${migrationIdentifier} IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appIdentifier}`,
  )
  await adminPool.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${migrationIdentifier} IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO ${appIdentifier}`,
  )
}

function runNodeScript(scriptPath, env) {
  const result = spawnSync(process.execPath, [scriptPath], { env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    return false
  }
  return true
}

async function main() {
  const migrationDb = readConfig('MIGRATION')
  const appDb = readConfig('APP')
  const appRole = validateRoleName(appDb.user, 'APP_DB_USER')
  const migrationUser = validateRoleName(migrationDb.user, 'MIGRATION_DB_USER')
  if (appRole === migrationUser) {
    throw new Error('APP_DB_USER must differ from MIGRATION_DB_USER; the web app cannot use the bootstrap login.')
  }
  if (appDb.password === migrationDb.password) {
    throw new Error('APP_DB_PASSWORD must differ from MIGRATION_DB_PASSWORD; use separate database credentials.')
  }

  const adminPool = new pg.Pool({ ...migrationDb, connectionTimeoutMillis: 10000 })
  try {
    await ensureRuntimeRole(adminPool, appRole, appDb.password, migrationDb.database)
  } finally {
    await adminPool.end()
  }

  const migrationEnv = {
    ...process.env,
    DATABASE_URL: postgresConnectionString(migrationDb),
  }
  console.log('Applying database migrations with the one-shot migration login...')
  if (!runNodeScript(join(scriptDirectory, 'migrate-unified.mjs'), migrationEnv)) return

  const grantPool = new pg.Pool({ ...migrationDb, connectionTimeoutMillis: 10000 })
  try {
    await grantRuntimePrivileges(grantPool, migrationUser, appRole, migrationDb.database)
  } finally {
    await grantPool.end()
  }

  const runtimePool = new pg.Pool({ ...appDb, connectionTimeoutMillis: 10000 })
  try {
    const identity = await runtimePool.query(
      `SELECT current_user AS user_name,
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
                   AND relation.relowner = role.oid
              ) AS owns_public_objects
         FROM pg_roles role WHERE role.rolname = current_user`,
    )
    if (
      identity.rowCount !== 1 ||
      identity.rows[0].user_name !== appRole ||
      identity.rows[0].rolsuper ||
      identity.rows[0].rolbypassrls ||
      identity.rows[0].rolcreatedb ||
      identity.rows[0].rolcreaterole ||
      identity.rows[0].rolreplication ||
      identity.rows[0].can_create_database ||
      identity.rows[0].can_create_in_public ||
      identity.rows[0].owns_public_objects
    ) {
      throw new Error('Runtime database login has unexpected elevated privileges or owns application objects.')
    }
    await runtimePool.query('SELECT version FROM public.schema_migrations LIMIT 1')
  } finally {
    await runtimePool.end()
  }

  const runtimeVerifyEnv = { ...process.env, DATABASE_URL: '' }
  delete runtimeVerifyEnv.MIGRATION_DB_PASSWORD
  delete runtimeVerifyEnv.MIGRATION_DB_USER
  runtimeVerifyEnv.DB_HOST = appDb.host
  runtimeVerifyEnv.DB_PORT = String(appDb.port)
  runtimeVerifyEnv.DB_NAME = appDb.database
  runtimeVerifyEnv.DB_USER = appDb.user
  runtimeVerifyEnv.DB_PASSWORD = appDb.password
  console.log('Verifying schema through the restricted runtime login...')
  runNodeScript(join(scriptDirectory, 'verify-migrations.mjs'), runtimeVerifyEnv)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`database bootstrap failed: ${error.message}`)
    process.exitCode = 1
  })
}
