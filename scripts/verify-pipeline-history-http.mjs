// Real source API/session proof against the existing marked synthetic database.
// Retains append-only synthetic evidence; never clones or mutates production.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { collectFileMigrations, computeDrift } from './verify-migrations.mjs'

const config = rehearsalDatabaseConfig()
assert.equal(config.database, 'metardu_runtime_verify')
assert.equal(new URL(config.adminUrl).port, '55433')
const base = 'http://127.0.0.1:3021'
const directory = '.cache/release-verify/pipeline-http'
const admin = new pg.Client({ connectionString: config.adminUrl, connectionTimeoutMillis: 5000 })
const ownerId = randomUUID(), otherId = randomUUID(), projectId = randomUUID()
const password = `synthetic-${randomUUID()}`
const ownerEmail = `pipeline-${ownerId}@example.invalid`, otherEmail = `pipeline-${otherId}@example.invalid`
const checks = []
let verifiedDatabase = false, accountsCreated = false, migrationPrepared = false, fixtureAccountsSuspended = false
const check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); assert.ok(passed, name) }
function sessionClient() {
  const cookies = new Map()
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: 'manual', signal: AbortSignal.timeout(50000),
      headers: { Origin: base, ...options.headers, ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}) } })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0], split = pair.indexOf('=')
      cookies.set(pair.slice(0, split), pair.slice(split + 1))
    }
    return response
  }
}
async function login(email, id) {
  const client = sessionClient()
  const csrf = await (await client('/api/auth/csrf')).json()
  await client('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/dashboard`, json: 'true' }) })
  assert.equal((await (await client('/api/auth/session')).json()).user?.id, id, 'The source server must authenticate the exact synthetic database actor.')
  return client
}
async function request(client, path, body) {
  const response = await client(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json()
  return { response, value }
}
await admin.connect()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  verifiedDatabase = true
  const role = (await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1', [config.runtimeRole])).rows[0]
  assert.ok(role && !role.rolsuper && !role.rolbypassrls)
  const files = collectFileMigrations()
  const before = (await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
  assert.ok(before.every(row => row.checksum), 'Never backfill or replace historical checksums in this verification.')
  const drift = computeDrift(files, before)
  assert.equal(drift.mutated.length, 0); assert.equal(drift.ghost.length, 0)
  if (drift.missing.length) {
    assert.ok(process.argv.includes('--prepare'), 'Use --prepare to apply only the pending source fixture migration.')
    assert.ok(drift.missing.every(version => ['108_pipeline_asbuilt_history', '109_surveyor_profile_privileges'].includes(version)), 'No unrelated pending migration may be applied by this fixture.')
    if (drift.missing.includes('108_pipeline_asbuilt_history')) {
      assert.equal((await admin.query("SELECT to_regclass('public.pipeline_asbuilt_batches') present")).rows[0].present, null)
    }
    const migrated = spawnSync(process.execPath, ['scripts/migrate-unified.mjs'], {
      env: { ...process.env, DATABASE_URL: config.adminUrl }, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024,
    })
    assert.equal(migrated.status, 0, 'The normal synthetic migration runner must pass; diagnostics withheld.')
    migrationPrepared = true
  }
  const after = (await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
  assert.ok(computeDrift(files, after).ok)
  for (const prior of before) assert.equal(after.find(row => row.version === prior.version)?.checksum, prior.checksum)
  check('synthetic schema matches source without rewriting historical hashes', true)
  // Match the production bootstrap's new-table grants in this old fixture role.
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_asbuilt_batches TO "${config.runtimeRole}"`)
  const hash = await bcrypt.hash(password, 10)
  await admin.query(`INSERT INTO users(id,email,password_hash,full_name,role,email_verified) VALUES
    ($1,$2,$3,'SYNTHETIC pipeline HTTP operator','user',true),($4,$5,$3,'SYNTHETIC other pipeline operator','user',true)`, [ownerId, ownerEmail, hash, otherId, otherEmail])
  accountsCreated = true
  await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)", [ownerId, otherId])
  await admin.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC pipeline HTTP verification - NOT FIELD EVIDENCE','engineering')", [projectId, ownerId])
  const crs = 'EPSG:32737', benchmark = 'SYNTHETIC BM - not field control'
  await admin.query(`INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by)
    VALUES($1,$2,'Synthetic WGS84 UTM 37S','WGS84','metres',37,'S',$3,'local','grid',3,$4)`, [projectId, crs, benchmark, ownerId])
  const owner = await login(ownerEmail, ownerId), other = await login(otherEmail, otherId), anonymous = sessionClient()
  check('real credential sessions resolve the exact synthetic actors', true)
  const path = `/api/project/${projectId}/pipeline-asbuilt`
  check('anonymous history access requires sign-in', (await anonymous(path)).status === 401)
  check('foreign owner cannot read private history', [403, 404].includes((await other(path)).status))
  const initial = await request(owner, path)
  check('owned project history starts empty and cannot be cached publicly', initial.response.ok && initial.value.data.length === 0 && initial.response.headers.get('cache-control') === 'private, no-store')
  const rawCsv = 'point_id,chainage_m,invert_rl_m,ground_rl_m,internal_diameter_mm,outside_diameter_mm\nSYN-P1,0,10,10.2,300,400\nSYN-P2,50,9.5,11,300,400'
  const body = { clientBatchId: randomUUID(), rawCsv, metadata: { route: 'SYNTHETIC drain A', designReference: '', verticalReference: benchmark, observer: 'Synthetic operator', instrument: '' }, criterion: null }
  const created = await request(owner, path, body)
  check('raw measured input is recorded by the real API', created.response.status === 201 && created.value.data.capture.rawCsv === rawCsv)
  const batch = created.value.data
  check('server computes signed outside-crown cover and downstream fall', Math.abs(batch.capture.result.points[0].coverDepth + 0.15) < 1e-12 && batch.capture.result.points[0].grade === 1 && batch.capture.result.points[1].grade === null)
  check('unknown criterion remains unassessed with the logged actor and project basis', batch.actor_id === ownerId && batch.project_id === projectId && batch.capture.result.points.every(point => point.coverAdequate === null) && batch.reference_snapshot.horizontal_crs === crs && batch.reference_snapshot.vertical_datum === benchmark)
  const replay = await request(owner, path, body)
  check('identical network retry returns the original record', replay.response.status === 200 && replay.value.replayed === true && replay.value.data.id === batch.id)
  check('changed input cannot reuse an existing delivery ID', (await request(owner, path, { ...body, rawCsv: rawCsv.replace('10.2', '12') })).response.status === 409)
  check('client-supplied calculation results are rejected', (await request(owner, path, { ...body, clientBatchId: randomUUID(), result: { certified: true } })).response.status === 400)
  check('foreign owner cannot append observations', [403, 404].includes((await request(other, path, { ...body, clientBatchId: randomUUID() })).response.status))
  const concurrent = { ...body, clientBatchId: randomUUID() }
  const deliveries = await Promise.all([request(owner, path, concurrent), request(owner, path, concurrent)])
  check('concurrent delivery appends exactly once', deliveries.every(result => [200, 201].includes(result.response.status)) && deliveries[0].value.data.id === deliveries[1].value.data.id)
  const summary = await request(owner, path)
  check('history returns lightweight summaries without raw payloads', summary.value.data.length === 2 && summary.value.data.every(row => row.point_count === 2 && row.capture === undefined && row.rawCsv === undefined))
  const original = await request(owner, `${path}?batchId=${batch.id}`)
  check('retained history reopens exact observations and result identity', original.response.ok && original.value.data.capture.rawCsv === rawCsv && original.value.data.input_hash === batch.input_hash && original.value.data.recorded_at === batch.recorded_at)
  await admin.query("UPDATE projects SET name='SYNTHETIC revised project label',engineering_data='{}'::jsonb WHERE id=$1 AND user_id=$2", [projectId, ownerId])
  const retained = await request(owner, `${path}?batchId=${batch.id}`)
  check('mutable project edits cannot overwrite the retained field archive', retained.response.ok && retained.value.data.project_name === batch.project_name && retained.value.data.capture.rawCsv === rawCsv)
  const proxy = await request(owner, '/api/db', { table: 'pipeline_asbuilt_batches', operation: 'insert', payload: { project_id: projectId, capture: { result: 'forged' } } })
  check('generic database proxy cannot forge pipeline archives', [400, 403].includes(proxy.response.status))
  const privilegeWrite = await request(owner, '/api/db', { table: 'surveyor_profiles', operation: 'update', filters: [{ column: 'user_id', op: 'eq', value: ownerId }], payload: { role: 'admin', verified_isk: true } })
  const profile = (await admin.query('SELECT role,verified_isk FROM surveyor_profiles WHERE user_id=$1', [ownerId])).rows[0]
  if (privilegeWrite.response.ok || profile.role !== 'surveyor' || profile.verified_isk === true) console.log(JSON.stringify({ syntheticPrivilegeProbe: true, httpStatus: privilegeWrite.response.status, roleAfter: profile.role, verifiedIskAfter: profile.verified_isk, proxyErrorCode: privilegeWrite.value.error?.code ?? null }))
  check('a surveyor cannot self-promote or self-verify through the database proxy', privilegeWrite.response.status === 403 && profile.role === 'surveyor' && profile.verified_isk !== true)
  const ownFilters = [{ column: 'user_id', op: 'eq', value: ownerId }]
  for (const [name, operation, payload] of [
    ['insert cannot assign account authority', 'insert', { role: 'admin' }],
    ['upsert cannot assign professional verification', 'upsert', { verified_isk: true }],
    ['mixed batches cannot hide protected values', 'upsert', [{ firm_name: 'SYNTHETIC' }, { role: 'admin' }]],
    ['suspension cannot be rewritten through the proxy', 'update', { is_suspended: false }],
    ['profile deletion cannot erase account restrictions', 'delete', undefined],
  ]) {
    const result = await request(owner, '/api/db', { table: 'surveyor_profiles', operation, filters: ownFilters, payload, onConflict: 'user_id' })
    check(name, result.response.status === 403)
  }
  const edited = await request(owner, '/api/db', { table: 'surveyor_profiles', operation: 'update', filters: ownFilters, payload: { firm_name: 'SYNTHETIC updated firm' } })
  check('ordinary firm updates remain usable', edited.response.ok && (await admin.query('SELECT firm_name FROM surveyor_profiles WHERE user_id=$1', [ownerId])).rows[0].firm_name === 'SYNTHETIC updated firm')
  const upserted = await request(owner, '/api/db', { table: 'surveyor_profiles', operation: 'upsert', payload: { user_id: ownerId, firm_name: 'SYNTHETIC upserted firm' }, onConflict: 'user_id' })
  check('document profile upserts remain usable', upserted.response.ok && (await admin.query('SELECT firm_name FROM surveyor_profiles WHERE user_id=$1', [ownerId])).rows[0].firm_name === 'SYNTHETIC upserted firm')
  await request(other, '/api/db', { table: 'surveyor_profiles', operation: 'update', filters: ownFilters, payload: { firm_name: 'forged' } })
  check('a different account cannot edit the owned profile', (await admin.query('SELECT firm_name FROM surveyor_profiles WHERE user_id=$1', [ownerId])).rows[0].firm_name === 'SYNTHETIC upserted firm')
  const globalRole = await owner(`/api/admin/users/${otherId}/role`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'super_admin' }) })
  check('ordinary account cannot assign global roles through the admin API', globalRole.status === 403)
  // Grant authority only from the synthetic maintenance connection, never via
  // the path under test. Verify legitimate admin workflows remain functional.
  await admin.query("UPDATE users SET role='admin' WHERE id=$1", [otherId])
  // Reuse the established session: privileged handlers must read the newly
  // authorized role from the database rather than trusting its old JWT role.
  const reviewer = other
  const assigned = await reviewer(`/api/admin/users/${ownerId}/role`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'viewer' }) })
  const assignedRole = (await admin.query('SELECT u.role,sp.role profile_role FROM users u JOIN surveyor_profiles sp ON sp.user_id=u.id WHERE u.id=$1', [ownerId])).rows[0]
  check('authorized global role assignment uses valid account and legacy roles', assigned.status === 200 && assignedRole.role === 'viewer' && assignedRole.profile_role === 'viewer')
  const priorVersion = (await admin.query('SELECT session_version FROM users WHERE id=$1', [ownerId])).rows[0].session_version
  const suspended = await reviewer(`/api/admin/users/${ownerId}/suspend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'SYNTHETIC authorization check only' }) })
  const suspendedState = (await admin.query('SELECT u.session_version,sp.is_suspended FROM users u JOIN surveyor_profiles sp ON sp.user_id=u.id WHERE u.id=$1', [ownerId])).rows[0]
  check('authorized suspension revokes the existing session version', suspended.status === 200 && suspendedState.is_suspended === true && suspendedState.session_version > priorVersion)
  const restored = await reviewer(`/api/admin/users/${ownerId}/suspend`, { method: 'DELETE' })
  const restoredState = (await admin.query('SELECT u.session_version,sp.is_suspended FROM users u JOIN surveyor_profiles sp ON sp.user_id=u.id WHERE u.id=$1', [ownerId])).rows[0]
  check('authorized restoration does not revive revoked sessions', restored.status === 200 && restoredState.is_suspended === false && restoredState.session_version === suspendedState.session_version)
  check('only the two intended records exist for this source fixture', Number((await admin.query('SELECT count(*) count FROM pipeline_asbuilt_batches WHERE project_id=$1', [projectId])).rows[0].count) === 2)
  assert.equal(checks.length, 31)
} finally {
  // Keep measured/archive fixtures immutable and clearly synthetic. Never
  // disable a retention trigger, remove a customer record or drop the database.
  if (verifiedDatabase && accountsCreated) {
    await admin.query("UPDATE users SET role='user' WHERE id=ANY($1::uuid[])", [[ownerId, otherId]])
    const suspended = await admin.query("UPDATE surveyor_profiles SET role='surveyor',verified_isk=false,is_suspended=true WHERE user_id=ANY($1::uuid[]) RETURNING user_id", [[ownerId, otherId]])
    fixtureAccountsSuspended = suspended.rowCount === 2
  }
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/result.json`, JSON.stringify({ syntheticOnly: true, base, database: config.database, projectId, ownerId, otherId, migrationPrepared,
    passed: checks.length === 31 && checks.every(check => check.passed) && fixtureAccountsSuspended, checks, evidenceRetained: true, fixtureAccountsSuspended,
    physicalInstrumentTested: false, browserRecordingFlowTested: false, productionMutated: false, customerRecordsCopied: false }, null, 2) + '\n')
  await admin.end()
}
