// Restricted-role proof in the existing, explicitly marked synthetic database.
// All fixtures and optional candidate DDL roll back. No production credentials.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { migrationChecksums } from './verify-migrations.mjs'
const config = rehearsalDatabaseConfig()
assert.equal(config.database, 'metardu_runtime_verify')
assert.equal(new URL(config.adminUrl).port, '55433')
const client = new pg.Client({ connectionString: config.adminUrl, connectionTimeoutMillis: 5000 })
const checks = []
const check = (name, passed) => { checks.push({ name, passed }); assert.ok(passed, name) }
await client.connect()
let transaction = false
try {
  assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  const role = (await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1', [config.runtimeRole])).rows[0]
  assert.ok(role && !role.rolsuper && !role.rolbypassrls)
  const sql = await readFile('src/lib/db/migrations/109_surveyor_profile_privileges.sql', 'utf8')
  const applied = (await client.query("SELECT checksum FROM schema_migrations WHERE version='109_surveyor_profile_privileges'")).rows[0]?.checksum
  if (applied || !process.argv.includes('--candidate')) {
    const source = migrationChecksums(Buffer.from(sql))
    assert.ok(applied && [source.checksum, ...source.equivalentChecksums].includes(applied), 'Verify the exact applied guard migration without rewriting its hash.')
  }
  await client.query('BEGIN'); transaction = true
  if (process.argv.includes('--candidate')) {
    await client.query(sql.split(/^-- DOWN:/m)[0])
  }
  const owner = randomUUID(), other = randomUUID(), newcomer = randomUUID()
  for (const id of [owner, other, newcomer]) await client.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-synthetic-hash','SYNTHETIC profile guard verification')", [id, `${id}@example.invalid`])
  await client.query("INSERT INTO surveyor_profiles(user_id,role,verified_isk,is_suspended) VALUES($1,'surveyor',false,false),($2,'surveyor',false,false)", [owner, other])
  await client.query(`SET LOCAL ROLE "${config.runtimeRole}"`)
  await client.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true),set_config('request.access_role','',true)", [owner])
  const rejected = async (name, run) => {
    await client.query('SAVEPOINT guarded_write')
    let code
    try { await run() } catch (error) { code = error.code }
    finally { await client.query('ROLLBACK TO SAVEPOINT guarded_write'); await client.query('RELEASE SAVEPOINT guarded_write') }
    if (code !== '42501') console.log(JSON.stringify({ name, unexpectedSqlState: code ?? null }))
    check(name, code === '42501')
  }
  await rejected('ordinary SQL cannot self-promote', () => client.query("UPDATE surveyor_profiles SET role='admin' WHERE user_id=$1", [owner]))
  await rejected('ordinary SQL cannot self-verify', () => client.query('UPDATE surveyor_profiles SET verified_isk=true WHERE user_id=$1', [owner]))
  await rejected('ordinary SQL cannot rewrite suspension', () => client.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=$1', [owner]))
  await rejected('ordinary SQL cannot delete account restrictions', () => client.query('DELETE FROM surveyor_profiles WHERE user_id=$1', [owner]))
  check('ordinary firm edits remain usable', (await client.query("UPDATE surveyor_profiles SET firm_name='SYNTHETIC survey firm' WHERE user_id=$1", [owner])).rowCount === 1)
  await rejected('ordinary SQL cannot change another profile authority', () => client.query('UPDATE surveyor_profiles SET verified_isk=true WHERE user_id=$1', [other]))
  await client.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true)", [newcomer])
  await rejected('new profiles cannot inject an elevated role', () => client.query("INSERT INTO surveyor_profiles(user_id,role) VALUES($1,'admin')", [newcomer]))
  await rejected('new profiles cannot inject verification', () => client.query("INSERT INTO surveyor_profiles(user_id,role,verified_isk) VALUES($1,'surveyor',true)", [newcomer]))
  check('ordinary registration profile remains usable', (await client.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)", [newcomer])).rowCount === 1)
  await rejected('conflict updates cannot inject verification', () => client.query("INSERT INTO surveyor_profiles(user_id,role,verified_isk) VALUES($1,'surveyor',true) ON CONFLICT(user_id) DO UPDATE SET verified_isk=EXCLUDED.verified_isk", [newcomer]))
  await client.query("SELECT set_config('request.access_role','platform_admin',true)")
  check('trusted platform review can update another profile', (await client.query('UPDATE surveyor_profiles SET verified_isk=true WHERE user_id=$1', [other])).rowCount === 1)
  check('trusted platform suspension remains usable', (await client.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=$1', [other])).rowCount === 1)
  check('suspension still revokes old sessions', (await client.query('SELECT session_version FROM users WHERE id=$1', [other])).rows[0].session_version > 0)
  await client.query('RESET ROLE')
  await client.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true)", [owner])
  check('administrative account deletion still cascades', (await client.query('DELETE FROM users WHERE id=$1', [newcomer])).rowCount === 1)
  await client.query('ROLLBACK'); transaction = false
  console.log(JSON.stringify({ syntheticOnly: true, candidateDdlRolledBack: process.argv.includes('--candidate'), checks, rolledBack: true, productionMutated: false }))
} finally { if (transaction) await client.query('ROLLBACK'); await client.end() }
