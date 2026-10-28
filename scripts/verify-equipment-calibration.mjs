// Source handlers + real PostgreSQL/RLS in the existing marked loopback fixture.
// Session/HTTP adapters and nested savepoints are explicit test boundaries.
// All fixture users, records and notifications are inside one rolled-back tx.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

assert.equal(process.argv.length, 2, 'This verifier has no arbitrary database override')
const service = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Purpose":{{json (index .Config.Labels "metardu.purpose")}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
assert.equal(service.Id, 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(service.Purpose, 'schema-rehearsal'); assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
const client = new pg.Client({ connectionString: 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis: 10000, statement_timeout: 10000, application_name: 'metardu-synthetic-equipment-rollback' })
const ids = { owner: randomUUID(), other: randomUUID() }
let actor = ids.owner, fault = false, begun = false
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript')
const originalLoad = Module._load, originalTs = Module._extensions['.ts']
const checks = [], provenance = []
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS ' + name) }
const query = (sql, params) => client.query(sql, fault && /^\s*INSERT INTO notifications\b/.test(sql) ? [null, params[1]] : params)
const database = { query, transaction: async callback => {
  await client.query('SAVEPOINT equipment_source_operation')
  try { const value = await callback({ query }); await client.query('RELEASE SAVEPOINT equipment_source_operation'); return value }
  catch (error) { await client.query('ROLLBACK TO SAVEPOINT equipment_source_operation'); await client.query('RELEASE SAVEPOINT equipment_source_operation'); throw error }
} }
Module._load = function(request, parent, ...args) {
  if (request === '@/lib/db') return { db: database }
  if (request === '@/lib/auth/session') return { getAuthUser: async () => actor ? { id: actor } : null }
  if (request === '@/lib/apiHandler') return {
    apiSuccess: data => require('next/server').NextResponse.json(data),
    apiHandler: (_options, handler) => async (req, ctx) => {
      try { return await handler(req, { userId: actor, params: ctx.params, body: ['POST', 'PATCH'].includes(req.method) ? await req.json() : undefined }) }
      catch (error) { return require('next/server').NextResponse.json({ error: error.message }, { status: error.statusCode ?? 500 }) }
    },
  }
  return originalLoad.call(this, request.startsWith('@/') ? path.resolve('src', request.slice(2)) : request, parent, ...args)
}
Module._extensions['.ts'] = function(module, file) {
  const source = readFileSync(file, 'utf8')
  provenance.push({ path: path.relative(process.cwd(), file).replaceAll('\\', '/'), sha256: createHash('sha256').update(source).digest('hex') })
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file)
}
const equipment = require('../src/app/api/equipment/route.ts'), calibration = require('../src/app/api/equipment/[id]/calibration/route.ts')
const { NextRequest } = require('next/server')
const invoke = async (handler, method, body, id, all = false) => {
  await client.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true)", [actor ?? ''])
  const req = new NextRequest('http://127.0.0.1/native-equipment?include_calibration=true' + (id ? '&id=' + id : '') + (all ? '&status=all' : ''), { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const response = await handler(req, { params: { id } })
  return { status: response.status, body: await response.json() }
}
let instrument, passed = false, cleanup = false
await client.connect()
try {
  const marker = (await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()" )).rows[0]?.marker
  assert.equal(marker, 'METARDU synthetic beacon verification only 2026-10-08')
  await client.query('BEGIN'); begun = true
  await client.query("SET LOCAL lock_timeout='3s'")
  await client.query("INSERT INTO users(id,email,password_hash,full_name) VALUES ($1,$2,'unusable-synthetic-no-login','SYNTHETIC instrument owner'),($3,$4,'unusable-synthetic-no-login','SYNTHETIC instrument other')", [ids.owner, 'equipment-' + ids.owner + '@example.invalid', ids.other, 'equipment-' + ids.other + '@example.invalid'])
  await client.query('SET LOCAL ROLE release_app')
  check('effective SQL role is restricted and cannot bypass row security', runtimeDatabaseRoleFailure((await client.query(RUNTIME_ROLE_QUERY)).rows[0]) === null)
  const added = await invoke(equipment.POST, 'POST', { name: 'SYNTHETIC calibration verifier', type: 'total_station', intervalDays: 180 })
  check('registration acknowledges a real owner-bound UUID row', added.status === 200 && typeof added.body.equipment?.id === 'string')
  instrument = added.body.equipment.id
  let list = await invoke(equipment.GET, 'GET')
  check('a new instrument remains explicitly unrecorded', list.body.equipment.length === 1 && list.body.equipment[0].calibration_status === 'never' && list.body.equipment[0].days_until_expiry === null)
  const failed = await invoke(calibration.POST, 'POST', { calibrationDate: '2026-10-01', results: 'failed' }, instrument)
  check('a failed calibration and review notification commit together', failed.status === 200 && failed.body.calibration.next_calibration_date === '2027-03-30' && Number((await client.query('SELECT count(*) FROM notifications WHERE user_id=$1', [ids.owner])).rows[0].count) === 1)
  list = await invoke(equipment.GET, 'GET')
  check('a future due date cannot turn a failed result into current', list.body.equipment[0].calibration_status === 'failed' && list.body.equipment[0].days_until_expiry === null)
  fault = true
  const rejected = await invoke(calibration.POST, 'POST', { calibrationDate: '2026-10-02', results: 'failed' }, instrument)
  fault = false
  check('a real PostgreSQL notification constraint failure refuses acknowledgement', rejected.status === 500)
  check('notification failure rolls back the preceding calibration insert', Number((await client.query('SELECT count(*) FROM equipment_calibration WHERE equipment_id=$1', [instrument])).rows[0].count) === 1)
  await invoke(equipment.PATCH, 'PATCH', { intervalDays: 730 }, instrument)
  list = await invoke(equipment.GET, 'GET')
  check('changing the interval does not rewrite the retained due date', list.body.equipment[0].next_calibration === '2027-03-30')
  const supplied = await invoke(calibration.POST, 'POST', { calibrationDate: '2026-10-03', nextCalibrationDate: '2027-02-03', results: 'pass' }, instrument)
  check('a supplied record due date is retained exactly', supplied.status === 200 && supplied.body.calibration.next_calibration_date === '2027-02-03')
  await invoke(equipment.PATCH, 'PATCH', { status: 'inactive' }, instrument)
  check('archived instruments leave the active list', (await invoke(equipment.GET, 'GET')).body.equipment.length === 0)
  const retainedHistory = await invoke(calibration.GET, 'GET', undefined, instrument)
  check('archived history request succeeds: ' + JSON.stringify({ status: retainedHistory.status, error: retainedHistory.body.error }), retainedHistory.status === 200)
  check('archived instruments remain available with their retained history', (await invoke(equipment.GET, 'GET', undefined, undefined, true)).body.equipment.length === 1 && retainedHistory.body.calibrations.length === 2)
  const legacyArchive = await invoke(equipment.DELETE, 'DELETE', undefined, instrument)
  check('legacy deletion acknowledges an archive while retaining all calibration rows', legacyArchive.body.archived === true && Number((await client.query('SELECT count(*) FROM equipment_calibration WHERE equipment_id=$1', [instrument])).rows[0].count) === 2)
  actor = ids.other
  check('another owner cannot enumerate the instrument', (await invoke(equipment.GET, 'GET', undefined, undefined, true)).body.equipment.length === 0)
  check('another owner cannot append calibration evidence', (await invoke(calibration.POST, 'POST', { calibrationDate: '2026-10-01', results: 'pass' }, instrument)).status === 404)
  actor = ids.owner
  check('missing or impossible evidence is rejected without a save', (await invoke(calibration.POST, 'POST', { calibrationDate: '2026-02-30', results: 'pass' }, instrument)).status === 400 && (await invoke(calibration.POST, 'POST', { calibrationDate: '2026-10-01' }, instrument)).status === 400)
  actor = null
  check('the route body refuses an absent session identity', (await invoke(equipment.GET, 'GET')).status === 401)
  passed = true
} finally {
  fault = false
  if (begun) {
    await client.query('ROLLBACK')
    const count = Number((await client.query('SELECT count(*) FROM users WHERE id=ANY($1::uuid[])', [[ids.owner, ids.other]])).rows[0].count)
    assert.equal(count, 0, 'Synthetic identity cleanup did not complete')
    cleanup = true
  }
  await client.end()
  Module._load = originalLoad
  if (originalTs) Module._extensions['.ts'] = originalTs; else delete Module._extensions['.ts']
  mkdirSync('test-results/equipment-calibration', { recursive: true })
  writeFileSync('test-results/equipment-calibration/native.json', JSON.stringify({ passed, syntheticOnly: true, physicalCalibrationVerified: false, productionVerified: false, providerSessionAdapted: true, transactionAdapter: 'nested savepoints inside rolled-back fixture', notificationFault: 'NULL user id injected only at synthetic notification boundary', cleanup, checks, provenance }, null, 2) + '\n')
}
