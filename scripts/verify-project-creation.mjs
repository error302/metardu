// Actual creation handler and PostgreSQL in an exact, owned rehearsal schema.
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
const token = randomUUID(), schema = `metardu_creation_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_creation_[a-f0-9]{32}$/)
const marker = `METARDU owned creation fixture ${token}`
const options = { connectionString: 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis: 5000, statement_timeout: 8000, application_name: `metardu-creation-${token}` }
const admin = new pg.Client(options)
const pool = new pg.Pool({ ...options, max: 2, options: `-c search_path=${schema},public` })
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
process.env.ADMIN_EMAILS = ''
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return { db: { query: (sql, values) => pool.query(sql, values), getClient: () => pool.connect() }, setRlsContext: async () => {} }
  if (request === '@/lib/logger') return { logger: { error() {} } }
  if (request === '@/lib/api/handler') return { AppError: require('../src/lib/api/errors.ts').AppError, apiHandler: config => async (req, userId) => {
    if (!userId) return Response.json({ error: 'Unauthenticated fixture caller' }, { status: 401 })
    const parsed = config.schema.safeParse(await req.json())
    if (!parsed.success) return Response.json({ error: 'Invalid fixture input' }, { status: 422 })
    try { return await config.handler({ input: parsed.data, userId, userEmail: 'synthetic@example.invalid' }) }
    catch (error) { return Response.json({ error: error.message, code: error.code }, { status: error.statusCode ?? 500 }) }
  } }
  return originalLoad.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...rest)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
}
const { POST } = require('../src/app/api/projects/route.ts')
const { siteReconnaissanceDrawing } = require('../src/lib/validation/mapDrawing.ts')
const { NextRequest } = require('next/server')
const owner = randomUUID()
const base = { name: 'SYNTHETIC creation only', survey_type: 'road' }
const drawing = { source: 'map-drawing', createdFrom: 'map-client', coordinateCrs: 'EPSG:4326', measurementCrs: 'EPSG:32737', drawnAreaSqM: 0, drawnPerimeterM: 0, drawnFeatures: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'SYNTHETIC-A', geometry: { type: 'Point', coordinates: [39.63,-4.11,0] }, properties: { role: 'SYNTHETIC reconnaissance only', nested: { text: 'retain exactly' } } }] } }
const invoke = (body = base, user = owner) => POST(new NextRequest('http://127.0.0.1:3021/api/projects', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), user)
const files = ['scripts/verify-project-creation.mjs', 'src/app/api/projects/route.ts', 'src/lib/subscription/subscriptionEngine.ts', 'src/lib/subscription/featureGates.ts', 'src/lib/validation/projectCreation.ts', 'src/lib/validation/mapDrawing.ts']
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
const report = { checkedAt: new Date().toISOString(), source: hashes(), fixtureSchema: schema, authentication: 'bounded adapter; not ordinary-account HTTP', rls: 'isolated fixture tables; not RLS acceptance', checks: [] }
const root = '.cache/project-creation'; mkdirSync(root, { recursive: true })
const save = () => writeFileSync(`${root}/native.json`, JSON.stringify(report, null, 2) + '\n')
const fingerprint = async () => {
  const result = {}
  for (const table of ['projects', 'scheme_details', 'user_subscriptions', 'project_reference_systems', 'setout_definitions', 'setout_points']) result[table] = (await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0]
  return result
}
const state = async () => ({ projects: (await pool.query('SELECT * FROM projects ORDER BY id')).rows, schemes: (await pool.query('SELECT * FROM scheme_details ORDER BY project_id')).rows })
const paid = () => pool.query(`INSERT INTO user_subscriptions(user_id,plan_id,status,current_period_end) VALUES ($1,'pro','active',NOW()+INTERVAL '30 days')`, [owner])
async function check(name, run) {
  try { await pool.query('TRUNCATE scheme_details, projects, user_subscriptions, project_members'); await run(); report.checks.push({ name, passed: true }) }
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
  await pool.query(`CREATE TABLE projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,name text,survey_type text,location text,utm_zone int,hemisphere text,project_type text,client_name text,surveyor_name text,country text,datum text,boundary_data jsonb,created_at timestamptz);
    CREATE TABLE scheme_details(project_id uuid PRIMARY KEY REFERENCES projects(id),scheme_number text,county text,sub_county text,ward text,planned_parcels int,adjudication_section text);
    CREATE TABLE user_subscriptions(user_id uuid PRIMARY KEY,plan_id text,status text,trial_ends_at timestamptz,current_period_start timestamptz,current_period_end timestamptz,payment_method text,currency text,seat_count int);
    CREATE TABLE project_members(user_id uuid);
    CREATE FUNCTION creation_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_TABLE_NAME='projects' THEN
        IF NEW.name='SUPPRESS SYNTHETIC' THEN RETURN NULL; END IF;
      ELSE
        IF NEW.scheme_number='SUPPRESS SYNTHETIC' THEN RETURN NULL; END IF;
        IF NEW.scheme_number='REJECT SYNTHETIC' THEN RAISE EXCEPTION 'owned scheme rejection'; END IF;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER creation_fault BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION creation_fault();
    CREATE TRIGGER creation_fault BEFORE INSERT ON scheme_details FOR EACH ROW EXECUTE FUNCTION creation_fault();`)
  await check('twelve simultaneous free creates admit exactly one project', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => invoke({ ...base, name: `SYNTHETIC free ${i}` })))
    assert.equal(results.filter(r => r.status === 201).length, 1); assert.equal(results.filter(r => r.status === 402).length, 11)
    assert.equal((await state()).projects.length, 1)
  })
  await check('active paid plan retains its unlimited project entitlement', async () => {
    await paid(); const results = await Promise.all(Array.from({ length: 8 }, (_, i) => invoke({ ...base, name: `SYNTHETIC paid ${i}` })))
    assert.ok(results.every(r => r.status === 201)); assert.equal((await state()).projects.length, 8)
  })
  await check('map features properties IDs zero metrics and CRS provenance round-trip exactly', async () => {
    const response = await invoke({ ...base, datum: 'WGS84', utm_zone: 37, hemisphere: 'S', boundary_data: drawing })
    assert.equal(response.status, 201); const row = (await state()).projects[0]
    assert.deepEqual(Object.fromEntries(Object.keys(drawing).map(key=>[key,row.boundary_data[key]])), drawing)
    assert.equal(row.boundary_data.mapDrawing.metrics.status,'available')
    assert.equal(row.boundary_data.mapDrawing.metrics.areaSqM,0)
    assert.equal(row.utm_zone, 37); assert.equal(row.hemisphere, 'S'); assert.equal(row.datum, 'WGS84')
  })
  await check('site sketch remains explicitly unverified without assigning a survey grid', async () => {
    const sketch = siteReconnaissanceDrawing([[39,-4],[39.001,-4],[39.001,-4.001],[39,-4]], 0)
    assert.equal((await invoke({ ...base, boundary_data: sketch })).status, 201)
    const row = (await state()).projects[0]; assert.deepEqual(row.boundary_data, sketch)
    assert.equal(row.utm_zone, null); assert.equal(row.datum, null); assert.equal(row.hemisphere, null)
  })
  for (const scheme_number of ['SUPPRESS SYNTHETIC','REJECT SYNTHETIC']) await check(`${scheme_number}: scheme failure rolls back parent and frees quota`, async () => {
    assert.equal((await invoke({ ...base, project_type: 'scheme', scheme_number })).status, 500)
    assert.deepEqual(await state(), { projects: [], schemes: [] })
    assert.equal((await invoke({ ...base, project_type: 'scheme', scheme_number: 'SYNTHETIC accepted' })).status, 201)
    const saved = await state(); assert.equal(saved.projects.length, 1); assert.equal(saved.schemes.length, 1); assert.equal(saved.projects[0].id, saved.schemes[0].project_id)
  })
  await check('suppressed parent cannot return false success or consume quota', async () => {
    assert.equal((await invoke({ ...base, name: 'SUPPRESS SYNTHETIC' })).status, 500)
    assert.equal((await state()).projects.length, 0); assert.equal((await invoke()).status, 201)
  })
  await check('unknown protected keys anonymous caller and inconsistent drawing CRS refuse creation', async () => {
    assert.equal((await invoke({ ...base, user_id: randomUUID() })).status, 422)
    assert.equal((await invoke(base, null)).status, 401)
    assert.equal((await invoke({ ...base, datum: 'WGS84', utm_zone: 36, hemisphere: 'S', boundary_data: drawing })).status, 422)
    assert.equal((await state()).projects.length, 0)
  })
  assert.equal(pool.waitingCount, 0); assert.equal(pool.idleCount, pool.totalCount); report.poolClientsReturned = true
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
    report.status = report.checks.length === 8 && report.checks.every(item => item.passed) && report.poolClientsReturned && report.ownedFixtureRemoved && report.originalRecordsPreserved && report.migrationLedgerPreserved ? 'passed' : 'failed'
    save()
  } finally { await admin.end() }
}
console.log(JSON.stringify({ status: report.status, checks: report.checks, preserved: report.originalRecordsPreserved, fixtureRemoved: report.ownedFixtureRemoved }, null, 2))
process.exitCode = report.status === 'passed' ? 0 : 1
