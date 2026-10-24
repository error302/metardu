// Actual settings handler and PostgreSQL in an exact, owned rehearsal schema.
// Authentication is a bounded adapter; this does not prove production HTTP or RLS.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const service = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
assert.equal(service.Id, 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal'); assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
const token = randomUUID(), schema = `metardu_settings_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_settings_[a-f0-9]{32}$/)
const marker = `METARDU owned settings fixture ${token}`
const options = { connectionString: 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis: 5000, statement_timeout: 8000, application_name: `metardu-settings-${token}` }
const admin = new pg.Client(options)
const pool = new pg.Pool({ ...options, max: 2, options: `-c search_path=${schema},public` })
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
let beforeWrite = null
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return { db: { query: async (sql, values) => { if (beforeWrite) { const hook = beforeWrite; beforeWrite = null; await hook() }; return pool.query(sql, values) } } }
  if (request === '@/lib/logger') return { logger: { warn() {} } }
  if (request === '@/lib/cache/memory-cache') return { CacheKeys: { project: id => id }, projectCache: { invalidate() {} } }
  if (request === '@/lib/apiHandler') return { apiHandler: (_options, handler) => async (req, userId, projectId) => {
    if (!userId) return Response.json({ error: 'Unauthenticated fixture caller' }, { status: 401 })
    try { return await handler(req, { userId, params: { id: projectId }, body: await req.json() }) }
    catch { return Response.json({ error: 'Fixture database request failed' }, { status: 500 }) }
  } }
  return originalLoad.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...rest)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
}
const { PATCH } = require('../src/app/api/project/[id]/route.ts')
const { NextRequest } = require('next/server')
const owner = randomUUID(), other = randomUUID(), projectId = randomUUID()
const invoke = (body, user = owner) => PATCH(new NextRequest(`http://127.0.0.1:3021/api/project/${projectId}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), user, projectId)
const files = ['scripts/verify-project-settings.mjs', 'src/app/api/project/[id]/route.ts', 'src/lib/validation/projectSettings.ts', 'src/lib/spatial/referenceDeclaration.ts']
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
const report = { checkedAt: new Date().toISOString(), source: hashes(), fixtureSchema: schema, authentication: 'bounded adapter; not ordinary-account HTTP', rls: 'isolated fixture tables; not RLS acceptance', checks: [] }
const root = '.cache/project-settings'; mkdirSync(root, { recursive: true })
const save = () => writeFileSync(`${root}/native.json`, JSON.stringify(report, null, 2) + '\n')
const fingerprint = async () => {
  const result = {}
  for (const table of ['projects', 'project_reference_systems', 'setout_definitions', 'setout_points', 'setout_observations', 'tolerance_profiles']) result[table] = (await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0]
  return result
}
const state = async () => (await pool.query('SELECT * FROM projects WHERE id=$1', [projectId])).rows[0]
async function reset() {
  beforeWrite = null
  await pool.query('TRUNCATE projects')
  await pool.query(`INSERT INTO projects(id,user_id,name,traverse,start_chainage) VALUES ($1,$2,'SYNTHETIC only',$3,0)`, [projectId, owner, JSON.stringify({ linearError: null, source: 'independent retained evidence', observations: [0, 3] })])
}
async function check(name, run) {
  try { await reset(); await run(); report.checks.push({ name, passed: true }) }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }) }
  save()
}
let created = false, original, ledger
await admin.connect()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  original = await fingerprint(); ledger = (await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  report.originalRecordsBefore = original; report.originalMigrationCount = ledger.length
  await admin.query(`CREATE SCHEMA ${schema}`); created = true
  await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name, schema)
  await pool.query(`CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid,name text,datum text,utm_zone int,hemisphere text,traverse jsonb,start_chainage double precision);
    CREATE FUNCTION settings_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.name='SUPPRESS SYNTHETIC' THEN RETURN NULL; END IF;
      IF NEW.name='REJECT SYNTHETIC' THEN RAISE EXCEPTION 'owned synthetic rejection'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER settings_fault BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION settings_fault();`)
  await check('name-only edit retains missing CRS, zero chainage and complete traverse', async () => {
    const before = await state(); assert.equal((await invoke({ name: 'SYNTHETIC renamed' })).status, 200)
    assert.deepEqual(await state(), { ...before, name: 'SYNTHETIC renamed' })
  })
  for (const value of [0, 0.002, null]) await check(`closure ${value} merges only its key`, async () => {
    const before = await state(); assert.equal((await invoke({ linear_error_m: value })).status, 200)
    assert.deepEqual(await state(), { ...before, traverse: { ...before.traverse, linearError: value } })
  })
  await check('late evidence update is retained by a name-only stale form save', async () => {
    beforeWrite = () => admin.query(`UPDATE ${schema}.projects SET traverse=traverse||'{"source":"new concurrent evidence","linearError":0.02}'::jsonb WHERE id=$1`, [projectId])
    assert.equal((await invoke({ name: 'SYNTHETIC new name' })).status, 200)
    assert.equal((await state()).traverse.source, 'new concurrent evidence'); assert.equal((await state()).traverse.linearError, 0.02)
  })
  await check('closure update merges evidence committed immediately before the write', async () => {
    beforeWrite = () => admin.query(`UPDATE ${schema}.projects SET traverse=traverse||'{"source":"new concurrent evidence"}'::jsonb WHERE id=$1`, [projectId])
    assert.equal((await invoke({ linear_error_m: 0 })).status, 200)
    assert.equal((await state()).traverse.source, 'new concurrent evidence'); assert.equal((await state()).traverse.linearError, 0)
  })
  await check('malformed legacy JSON cannot be silently replaced', async () => {
    await pool.query("UPDATE projects SET traverse='[]'::jsonb WHERE id=$1", [projectId]); const before = await state()
    assert.equal((await invoke({ linear_error_m: 0 })).status, 409); assert.deepEqual(await state(), before)
  })
  await check('ownership change before update refuses the complete metadata write', async () => {
    beforeWrite = () => admin.query(`UPDATE ${schema}.projects SET user_id=$1 WHERE id=$2`, [other, projectId])
    assert.equal((await invoke({ name: 'Unauthorized' })).status, 409); assert.equal((await state()).name, 'SYNTHETIC only')
  })
  for (const [name, status] of [['SUPPRESS SYNTHETIC', 409], ['REJECT SYNTHETIC', 500]]) await check(`${name}: no false save or partial mutation`, async () => {
    const before = await state(); assert.equal((await invoke({ name, linear_error_m: 1 })).status, status); assert.deepEqual(await state(), before)
  })
  await check('protected payload and anonymous adapter caller cannot mutate fixture', async () => {
    const before = await state(); assert.equal((await invoke({ datum: 'ARC1960' })).status, 400)
    assert.equal((await invoke({ name: 'Anonymous' }, null)).status, 401); assert.deepEqual(await state(), before)
  })
  await check('repeated metadata saves return database connections', async () => {
    for (let i = 0; i < 25; i++) assert.equal((await invoke({ name: `SYNTHETIC ${i}` })).status, 200)
    assert.equal(pool.waitingCount, 0); assert.equal(pool.totalCount, pool.idleCount)
  })
} finally {
  await pool.end()
  try {
    if (created) {
      assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1", [schema])).rows[0].marker, marker)
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount, 0); report.ownedFixtureRemoved = true
    }
    if (original) { assert.deepEqual(await fingerprint(), original); report.originalRecordsPreserved = true }
    if (ledger) { assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows, ledger); report.migrationLedgerPreserved = true }
    assert.deepEqual(hashes(), report.source); report.sourcePreserved = true
    report.status = report.checks.length === 12 && report.checks.every(item => item.passed) && report.ownedFixtureRemoved && report.originalRecordsPreserved && report.migrationLedgerPreserved ? 'passed' : 'failed'
    save()
  } finally { await admin.end() }
}
console.log(JSON.stringify({ status: report.status, checks: report.checks, preserved: report.originalRecordsPreserved, fixtureRemoved: report.ownedFixtureRemoved }, null, 2))
process.exitCode = report.status === 'passed' ? 0 : 1
