// Native, rollback-only regression for existing personal-project read grants.
// Reuses the exact marked rehearsal database; never loads deployment credentials.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const config = rehearsalDatabaseConfig()
assert.equal(config.database, 'metardu_runtime_verify')
assert.equal(new URL(config.adminUrl).port, '55433')
const candidate = process.argv.includes('--candidate')
const client = new pg.Client({ connectionString: config.adminUrl, connectionTimeoutMillis: 5000 })
const ids = Object.fromEntries(['owner', 'reader', 'stranger', 'invalid', 'organization', 'project', 'firmProject', 'unassigned'].map(key => [key, randomUUID()]))
const report = { scope: 'rollback-only synthetic RLS', candidate, checks: [], status: 'checking', rolledBack: false }
const directory = '.cache/release-verify/personal-project-read-rls'
mkdirSync(directory, { recursive: true })
const receipt = `${directory}/${candidate ? 'candidate' : 'current'}-${Date.now()}.json`
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); console.log(`PASS ${name}`) }
await client.connect()
let ledger
async function runtime(userId, organizationId = '') {
  await client.query(`SET LOCAL ROLE "${config.runtimeRole}"`)
  await client.query("SELECT set_config('request.user_id', $1, true), set_config('app.current_user_id', $2, true), set_config('request.organization_id', $3, true), set_config('request.access_role', '', true)", [userId, userId || '00000000-0000-0000-0000-000000000000', organizationId])
}
async function visible(id) { return (await client.query('SELECT id FROM projects WHERE id = $1', [id])).rowCount }
async function locked(id) { return (await client.query('SELECT user_id FROM public.lock_project_for_read($1)', [id])).rowCount }
async function denied(sql, values, name) {
  await client.query('SAVEPOINT read_only_check')
  try { check(name, (await client.query(sql, values)).rowCount === 0) }
  catch (error) { if (error.code !== '42501') throw error; check(name, true) }
  finally { await client.query('ROLLBACK TO SAVEPOINT read_only_check') }
}
try {
  assert.equal((await client.query("SELECT shobj_description(oid, 'pg_database') marker FROM pg_database WHERE datname = current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  const role = (await client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1', [config.runtimeRole])).rows[0]
  assert.ok(role && !role.rolsuper && !role.rolbypassrls)
  ledger = (await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows
  await client.query('BEGIN')
  if (candidate) {
    for (const file of ['111_personal_project_reader_rls.sql', '112_project_reader_snapshot_lock.sql']) {
      const sql = readFileSync(`src/lib/db/migrations/${file}`, 'utf8')
      await client.query(sql.split(/^\s*--\s*DOWN\b.*$/im)[0])
    }
  }
  for (const key of ['owner', 'reader', 'stranger', 'invalid']) {
    await client.query("INSERT INTO users(id, email, password_hash, full_name) VALUES($1, $2, 'unusable-native-rls-fixture', 'SYNTHETIC rollback-only project reader')", [ids[key], `reader-rls-${ids[key]}@example.invalid`])
  }
  await client.query("INSERT INTO organizations(id,name,slug,owner_id,plan,max_seats,is_active) VALUES($1,'SYNTHETIC reader scope',$2,$3,'team',10,true)", [ids.organization, `reader-rls-${ids.organization}`, ids.owner])
  await client.query("INSERT INTO projects(id,name,user_id,organization_id) VALUES($1,'SYNTHETIC personal reader',$2,NULL),($3,'SYNTHETIC firm scope',$2,$4),($5,'SYNTHETIC unassigned',NULL,NULL)", [ids.project, ids.owner, ids.firmProject, ids.organization, ids.unassigned])
  await client.query("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer'),($1,$3,'unrecognized'),($4,$2,'viewer'),($5,$2,'viewer')", [ids.project, ids.reader, ids.invalid, ids.firmProject, ids.unassigned])

  await runtime(ids.owner)
  check('personal owner retains project access', await visible(ids.project) === 1)
  check('owner can lock a readable personal project', await locked(ids.project) === 1)
  await runtime(ids.reader)
  check('existing personal viewer sees the project through real RLS', await visible(ids.project) === 1)
  check('viewer can take a snapshot lock without UPDATE access', await locked(ids.project) === 1)
  const memberships = (await client.query('SELECT user_id FROM project_members WHERE project_id = $1', [ids.project])).rows
  check('viewer can read only their own membership for application RBAC', memberships.length === 1 && memberships[0].user_id === ids.reader)
  await denied("UPDATE projects SET name='FORBIDDEN' WHERE id=$1", [ids.project], 'viewer cannot update the project')
  await denied('DELETE FROM projects WHERE id=$1', [ids.project], 'viewer cannot delete the project')
  await denied("UPDATE project_members SET role='org_admin' WHERE project_id=$1 AND user_id=$2", [ids.project, ids.reader], 'viewer cannot promote their membership')
  await denied('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [ids.project, ids.invalid], 'viewer cannot remove another membership')
  check('legacy personal grant cannot bypass firm role requirements', await visible(ids.firmProject) === 0)
  await runtime(ids.reader, ids.organization)
  check('selected firm context alone does not activate a legacy project grant', await visible(ids.firmProject) === 0)
  check('legacy firm grant cannot use the snapshot lock helper', await locked(ids.firmProject) === 0)
  check('unassigned legacy projects remain private despite a membership row', await visible(ids.unassigned) === 0)
  check('unassigned legacy project cannot be locked through a membership', await locked(ids.unassigned) === 0)
  await runtime(ids.invalid)
  check('unknown membership roles do not grant project visibility', await visible(ids.project) === 0)
  check('unknown membership role cannot lock the project', await locked(ids.project) === 0)
  await runtime(ids.stranger)
  check('another account cannot discover the project', await visible(ids.project) === 0)
  check('another account cannot lock the project', await locked(ids.project) === 0)
  await denied("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer')", [ids.project, ids.stranger], 'another account cannot grant itself access')
  await runtime('')
  check('empty request identity cannot read personal projects', await visible(ids.project) === 0)
  check('empty request identity cannot lock personal projects', await locked(ids.project) === 0)
  await client.query('RESET ROLE')
  await client.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [ids.project, ids.reader])
  await runtime(ids.reader)
  check('membership removal revokes project visibility immediately', await visible(ids.project) === 0)
  check('membership removal revokes snapshot locking immediately', await locked(ids.project) === 0)
  check('revoked viewer cannot read their previous membership', (await client.query('SELECT id FROM project_members WHERE project_id=$1', [ids.project])).rowCount === 0)
  report.status = 'passed'
} catch (error) { report.status = 'failed'; report.failure = error.message; throw error }
finally {
  await client.query('ROLLBACK')
  report.rolledBack = true
  if (ledger) assert.deepEqual((await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows, ledger)
  writeFileSync(receipt, JSON.stringify(report, null, 2) + '\n')
  await client.end()
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, rolledBack: report.rolledBack, receipt }))
