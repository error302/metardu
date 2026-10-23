// Real source handlers, ownership helpers and SQL in one exact owned fixture.
// Authentication and rate limiting are represented by a bounded test adapter.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const phase = process.argv[2]
assert.ok(['red', 'green'].includes(phase) && process.argv.length === 3, 'Use only red or green against the fixed rehearsal service.')
const serviceId = 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
const service = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
assert.equal(service.Id, serviceId); assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal'); assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
const connectionString = 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
const token = randomUUID(), schema = `metardu_engineering_access_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_engineering_access_[a-f0-9]{32}$/)
const marker = `METARDU owned engineering-access fixture ${token}`
const options = { connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000, application_name: `metardu-engineering-access-${token}` }
const admin = new pg.Client(options)
const pool = new pg.Pool({ ...options, max: 5, options: `-c search_path=${schema},public` })
const files = ['scripts/verify-engineering-data-access.mjs', 'src/app/api/engineering/data/route.ts', 'src/lib/validation/apiSchemas.ts', 'src/lib/validation/engineeringPayload.ts', 'src/lib/auth/ownership.ts', 'src/lib/auth/rbac.ts'].filter(existsSync)
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
const report = { phase, serviceId, source: hashes(), checks: [] }
mkdirSync('.cache/engineering-data-access', { recursive: true })
const save = () => writeFileSync(`.cache/engineering-data-access/${phase}.json`, JSON.stringify(report, null, 2))
let beforeTransaction = null
let beforeReadSnapshot = null
let afterProjectLock = null
const database = {
  query: async (sql, values) => {
    if (beforeReadSnapshot && sql.includes('AS project_owner')) { const hook = beforeReadSnapshot; beforeReadSnapshot = null; await hook() }
    return pool.query(sql, values)
  },
  transaction: async work => {
    if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; await hook() }
    const client = await pool.connect()
    const observed = { query: async (sql, values) => {
      const result = await client.query(sql, values)
      if (afterProjectLock && /FROM projects.*FOR SHARE/s.test(sql)) { const hook = afterProjectLock; afterProjectLock = null; await hook() }
      return result
    } }
    try { await client.query('BEGIN'); const result = await work(observed); await client.query('COMMIT'); return result }
    catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  },
}
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return { db: database }
  if (request === '@/lib/apiHandler') return { apiHandler: (options, handler) => async (req, userId) => {
    if (options.auth && !userId) return Response.json({ error: 'Unauthenticated test caller' }, { status: 401 })
    let body
    if (req.method === 'POST') {
      body = await req.json()
      const parsed = options.schema?.safeParse(body)
      if (parsed && !parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 })
      if (parsed) body = parsed.data
    }
    try { return await handler(req, { body, userId, params: {} }) }
    catch (error) { return Response.json({ code: error.code || 'INTERNAL_ERROR' }, { status: error.statusCode || 500 }) }
  } }
  const resolved = request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request
  return originalLoad.call(this, resolved, parent, ...rest)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
}
const { GET, POST } = require('../src/app/api/engineering/data/route.ts')
const { NextRequest } = require('next/server')
const owner = randomUUID(), other = randomUUID(), viewer = randomUUID(), project = randomUUID()
const request = (method = 'GET', body, id = project) => new NextRequest(`http://127.0.0.1/api/engineering/data?projectId=${id}`, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
const input = () => ({ projectId: project, subtype: 'road', data: { zero: 0, unknown: null, negative: -1, rows: [{ id: 'original' }] } })
const state = async () => (await pool.query('SELECT * FROM engineering_survey_data ORDER BY id')).rows
async function reset() {
  beforeTransaction = null
  beforeReadSnapshot = null
  afterProjectLock = null
  await pool.query('TRUNCATE engineering_survey_data, project_members')
  await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [owner, project])
  await pool.query("INSERT INTO engineering_survey_data(project_id,subtype,data) VALUES($1,'original',$2::jsonb)", [project, JSON.stringify({ retained: 0 })])
}
async function check(name, run) {
  await reset()
  try { await run(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`) }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}`) }
  save()
}
let created = false
await admin.connect()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  const ledger = (await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  const fingerprint = async () => (await admin.query("SELECT count(*)::int count, md5(COALESCE(string_agg(row_to_json(record)::text, E'\\n' ORDER BY id),'')) hash FROM public.engineering_survey_data record")).rows[0]
  report.originalPayloadBefore = await fingerprint()
  report.rehearsalPublicTableRls = (await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.engineering_survey_data'::regclass")).rows[0]
  await admin.query(`CREATE SCHEMA ${schema}`); created = true
  await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name, schema)
  report.fixtureSchemaVerified = true
  await pool.query('CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid,organization_id uuid); CREATE TABLE project_members(user_id uuid,project_id uuid,role text); CREATE TABLE engineering_survey_data(LIKE public.engineering_survey_data INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)')
  await pool.query('INSERT INTO projects(id,user_id) VALUES($1,$2)', [project, owner])
  await pool.query("CREATE FUNCTION suppress_owned_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.subtype='SUPPRESS' THEN RETURN NULL; END IF; RETURN NEW; END $$; CREATE TRIGGER owned_suppression BEFORE INSERT OR UPDATE ON engineering_survey_data FOR EACH ROW EXECUTE FUNCTION suppress_owned_write()")

  await check('authenticated stranger cannot read another project payload', async () => {
    const before = await state(); assert.equal((await GET(request(), other)).status, 403); assert.deepEqual(await state(), before)
  })
  await check('authenticated stranger cannot overwrite another project payload', async () => {
    const before = await state(); assert.equal((await POST(request('POST', input()), other)).status, 403); assert.deepEqual(await state(), before)
  })
  await check('authorized viewer can read privately but cannot write', async () => {
    await pool.query("INSERT INTO project_members VALUES($1,$2,'viewer')", [viewer, project])
    const read = await GET(request(), viewer); assert.equal(read.status, 200); assert.equal(read.headers.get('Cache-Control'), 'private, no-store')
    const before = await state(); assert.equal((await POST(request('POST', input()), viewer)).status, 403); assert.deepEqual(await state(), before)
  })
  await check('unassigned project data stays private even to a listed member', async () => {
    await pool.query('UPDATE projects SET user_id=NULL WHERE id=$1', [project]); await pool.query("INSERT INTO project_members VALUES($1,$2,'viewer')", [viewer, project])
    assert.equal((await GET(request(), viewer)).status, 403); assert.equal((await POST(request('POST', input()), viewer)).status, 403)
  })
  await check('owner save preserves zero null negative and nested records in real SQL', async () => {
    const response = await POST(request('POST', input()), owner); assert.equal(response.status, 200)
    assert.deepEqual((await state())[0].data, input().data); assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  })
  await check('empty owner payload reads as null and first save creates a confirmed row', async () => {
    await pool.query('DELETE FROM engineering_survey_data WHERE project_id=$1', [project])
    const empty = await GET(request(), owner)
    assert.equal(empty.status, 200); assert.deepEqual(await empty.json(), { data: null })
    assert.equal(empty.headers.get('Cache-Control'), 'private, no-store')
    const created = await POST(request('POST', input()), owner)
    assert.equal(created.status, 200); assert.equal((await state()).length, 1)
    assert.deepEqual((await created.json()).data.data, input().data)
  })
  await check('silent trigger suppression cannot return successful persistence', async () => {
    const before = await state(); const response = await POST(request('POST', { ...input(), subtype: 'SUPPRESS' }), owner)
    assert.equal(response.status, 500); assert.deepEqual(await state(), before)
  })
  for (const method of ['GET', 'POST']) await check(`owner transfer before ${method} snapshot blocks access`, async () => {
    const before = await state()
    const transfer = () => pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [other, project])
    if (method === 'GET') beforeReadSnapshot = transfer
    else beforeTransaction = transfer
    const response = method === 'GET' ? await GET(request(), owner) : await POST(request('POST', input()), owner)
    assert.equal(response.status, 403); assert.deepEqual(await state(), before)
  })
  await check('owner transfer waits for the admitted write transaction to commit', async () => {
    const applicationName = `metardu-eng-transfer-${token}`
    assert.ok(Buffer.byteLength(applicationName) <= 63, 'Diagnostic connection label must not be truncated by PostgreSQL.')
    const transferClient = new pg.Client({ ...options, application_name: applicationName, options: `-c search_path=${schema},public` })
    let transfer
    await transferClient.connect()
    try {
      afterProjectLock = async () => {
        transfer = transferClient.query('UPDATE projects SET user_id=$1 WHERE id=$2', [other, project])
        transfer.catch(() => undefined)
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
          if ((await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName])).rowCount === 1) {
            report.transferLockObserved = true
            return
          }
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        throw new Error('The exact transfer connection never waited on the owner lock.')
      }
      const response = await POST(request('POST', input()), owner)
      assert.equal(response.status, 200); assert.ok(transfer, 'Route did not take an owner lock')
      await transfer
      assert.equal((await pool.query('SELECT user_id FROM projects WHERE id=$1', [project])).rows[0].user_id, other)
      assert.deepEqual((await state())[0].data, input().data)
      assert.equal((await GET(request(), owner)).status, 403)
    } finally {
      if (transfer) await transfer.catch(() => undefined)
      await transferClient.end()
    }
  })
  await check('malformed project IDs are rejected before PostgreSQL UUID conversion', async () => {
    assert.equal((await GET(request('GET', undefined, 'not-a-uuid'), owner)).status, 400)
    assert.equal((await POST(request('POST', { ...input(), projectId: 'not-a-uuid' }), owner)).status, 400)
  })
  await check('JSON numeric overflow cannot silently become a stored null', async () => {
    const before = await state(); const body = `{"projectId":"${project}","subtype":"road","data":{"rl":1e400}}`
    assert.equal((await POST(request('POST', body), owner)).status, 400); assert.deepEqual(await state(), before)
  })
  await check('anonymous adapter control refuses admission', async () => { assert.equal((await GET(request(), null)).status, 401) })
  assert.deepEqual(await fingerprint(), report.originalPayloadBefore); report.originalPayloadPreserved = true
  assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows, ledger); report.migrationLedgerPreserved = true
} finally {
  try {
    await pool.end()
    if (created) {
      assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1", [schema])).rows[0].marker, marker)
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount, 0)
      report.ownedFixtureRemoved = true
    }
    assert.deepEqual(hashes(), report.source); report.sourcePreserved = true
    report.status = report.checks.length === 13 && report.checks.every(check => check.passed) && report.ownedFixtureRemoved && report.originalPayloadPreserved && report.migrationLedgerPreserved ? 'passed' : 'failed'
    save()
  } catch (error) {
    report.status = 'failed'; report.finalizationError = error.message; save(); throw error
  } finally { await admin.end() }
}
process.exitCode = report.status === 'passed' ? 0 : 1
