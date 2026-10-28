// Rollback-only feed authorization regression in the existing marked QA database.
// Never reads production credentials or changes an existing account/membership.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import ts from 'typescript'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const config = rehearsalDatabaseConfig()
assert.equal(config.database, 'metardu_runtime_verify')
assert.equal(new URL(config.adminUrl).port, '55433')
const compiled = ts.transpileModule(readFileSync('src/lib/activityFeed.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const { activityFeedQuery } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
const client = new pg.Client({ connectionString: config.adminUrl, connectionTimeoutMillis: 5000 })
const ids = Object.fromEntries(['owner', 'reader', 'stranger', 'invalid', 'organization', 'project', 'privateProject', 'firmProject', 'unassigned'].map(key => [key, randomUUID()]))
const report = { scope: 'rollback-only synthetic dashboard activity', checks: [], status: 'checking', rolledBack: false }
const directory = '.cache/release-verify/dashboard-activity'
mkdirSync(directory, { recursive: true })
const receipt = directory + '/' + Date.now() + '.json'
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); console.log('PASS ' + name) }
await client.connect()
let ledger
async function runtime(userId, organizationId = '') {
  await client.query('SET LOCAL ROLE "' + config.runtimeRole + '"')
  await client.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$2,true),set_config('request.organization_id',$3,true),set_config('request.access_role','',true)", [userId, userId || '00000000-0000-0000-0000-000000000000', organizationId])
}
async function feed(userId, projectId = null, limit = 50, offset = 0) {
  return (await client.query(activityFeedQuery, [userId, limit, offset, projectId])).rows
}
try {
  assert.equal((await client.query("SELECT shobj_description(oid, 'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  const role = (await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1', [config.runtimeRole])).rows[0]
  assert.ok(role && !role.rolsuper && !role.rolbypassrls)
  ledger = (await client.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
  await client.query('BEGIN')
  for (const key of ['owner', 'reader', 'stranger', 'invalid']) {
    await client.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-feed-test','SYNTHETIC feed test')", [ids[key], 'feed-' + ids[key] + '@example.invalid'])
  }
  await client.query("INSERT INTO organizations(id,name,slug,owner_id,plan,max_seats,is_active) VALUES($1,'SYNTHETIC feed firm',$2,$3,'team',10,true)", [ids.organization, 'feed-' + ids.organization, ids.owner])
  await client.query("INSERT INTO projects(id,name,user_id,organization_id) VALUES($1,'SYNTHETIC shared project',$2,NULL),($3,'SYNTHETIC private project',$2,NULL),($4,'SYNTHETIC firm project',$2,$5),($6,'SYNTHETIC unassigned',NULL,NULL)", [ids.project, ids.owner, ids.privateProject, ids.firmProject, ids.organization, ids.unassigned])
  await client.query("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer'),($1,$3,'unrecognized'),($4,$2,'viewer'),($5,$2,'viewer')", [ids.project, ids.reader, ids.invalid, ids.firmProject, ids.unassigned])
  await client.query("INSERT INTO user_activity(user_id,project_id,activity_type,description) VALUES($1,$2,'payment_received','PRIVATE account event'),($1,NULL,'settings_changed','PRIVATE settings')", [ids.owner, ids.project])
  for (const project of ['project', 'privateProject', 'firmProject', 'unassigned']) {
    await client.query("INSERT INTO audit_chain(project_id,user_id,user_name,entity_type,entity_id,action,entry_hash,payload) VALUES($1,$2,'Synthetic crew member','parcel','synthetic-entity','update',$3,$4)", [ids[project], ids.owner, '0'.repeat(64), { secret: 'MUST NOT LEAK' }])
  }
  await client.query("INSERT INTO audit_chain(project_id,user_id,entity_type,entity_id,action,entry_hash) VALUES($1,$2,'system','synthetic-private','update',$3)", [ids.project, ids.owner, '0'.repeat(64)])
  await runtime(ids.owner)
  const own = await feed(ids.owner)
  check('owner sees durable project creation and own private entries', own.some(e => e.id === 'project:' + ids.project) && own.some(e => e.description === 'PRIVATE settings'))
  await runtime(ids.reader)
  const shared = await feed(ids.reader)
  check('viewer sees shared creation and teammate audit events', shared.length === 2 && shared.some(e => e.source === 'project_audit' && e.actor_name === 'Synthetic crew member'))
  check('other personal/account events and raw audit payloads stay private', !JSON.stringify(shared).includes('PRIVATE') && !JSON.stringify(shared).includes('MUST NOT LEAK') && shared.every(e => !('payload' in e) && !('metadata' in e)))
  check('unassigned, private and firm projects remain hidden', shared.every(e => e.project_id === ids.project))
  check('project filter cannot expose a different project', (await feed(ids.reader, ids.privateProject)).length === 0)
  check('pagination uses stable event ordering', (await feed(ids.reader, null, 1, 1))[0].id === shared[1].id)
  await runtime(ids.reader, ids.organization)
  check('selecting a firm without active membership grants nothing', (await feed(ids.reader, ids.firmProject)).length === 0)
  await client.query('RESET ROLE')
  await client.query("INSERT INTO organization_members(organization_id,user_id,role,is_active,accepted_at) VALUES($1,$2,'viewer',true,NOW())", [ids.organization, ids.reader])
  await runtime(ids.reader, ids.organization)
  check('active firm viewer sees firm creation and teammate events', (await feed(ids.reader, ids.firmProject)).length === 2)
  await runtime(ids.reader)
  check('firm events require the selected organization context', (await feed(ids.reader, ids.firmProject)).length === 0)
  await client.query('RESET ROLE')
  await client.query('UPDATE organization_members SET is_active=false WHERE organization_id=$1 AND user_id=$2', [ids.organization, ids.reader])
  await runtime(ids.reader, ids.organization)
  check('deactivated firm member loses historical firm events immediately', (await feed(ids.reader, ids.firmProject)).length === 0)
  await runtime(ids.invalid)
  check('unknown project membership roles grant no activity', (await feed(ids.invalid)).length === 0)
  await runtime(ids.stranger)
  check('unrelated accounts cannot discover activity', (await feed(ids.stranger)).length === 0)
  await runtime('')
  check('anonymous identity sees no activity', (await feed('00000000-0000-0000-0000-000000000000')).length === 0)
  await client.query('RESET ROLE')
  await client.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [ids.project, ids.reader])
  await runtime(ids.reader)
  check('membership removal immediately hides historical events', (await feed(ids.reader)).length === 0)
  report.status = 'passed'
} catch (error) { report.status = 'failed'; report.failure = error.message; throw error }
finally {
  await client.query('ROLLBACK')
  report.rolledBack = true
  if (ledger) assert.deepEqual((await client.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows, ledger)
  check('owned fixture accounts were rolled back', (await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[])', [[ids.owner, ids.reader, ids.stranger, ids.invalid]])).rowCount === 0)
  writeFileSync(receipt, JSON.stringify(report, null, 2) + '\n')
  await client.end()
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, rolledBack: report.rolledBack, receipt }))
