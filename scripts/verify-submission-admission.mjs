// Real source + native PostgreSQL in the existing, identity-checked synthetic
// service. Routes use an adapted owner context: this is not HTTP/session/RLS proof.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

assert.equal(process.argv.length, 2)
const serviceId = 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
const inspected = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Purpose":{{json (index .Config.Labels "metardu.purpose")}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', timeout: 30000, windowsHide: true }))
assert.equal(inspected.Id, serviceId); assert.equal(inspected.Purpose, 'schema-rehearsal'); assert.equal(inspected.Running, true)
assert.deepEqual(inspected.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
const token = randomUUID(), schema = `metardu_submission_verify_${token.replaceAll('-', '')}`, marker = `METARDU owned submission fixture ${token}`
assert.match(schema, /^metardu_submission_verify_[a-f0-9]{32}$/)
const connectionString = 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
const admin = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 10000, options: `-c search_path=${schema},public` })
const report = { checkedAt: new Date().toISOString(), serviceId, checks: [], sourceHashes: {}, status: 'running', productionChanged: false, containerLifecycleChanged: false, httpAuthProof: false, rlsProof: false, fieldProof: false }
const root = '.cache/submission-admission'; mkdirSync(root, { recursive: true })
const save = () => writeFileSync(`${root}/native.json`, JSON.stringify(report, null, 2) + '\n')
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
const owner = randomUUID(), projectId = randomUUID()
Module._load = function(request, parent, ...rest) {
  if (request === '@/lib/db' || request === '../db') return { __esModule: true, db: pool, default: pool }
  if (request === '@/lib/logger') return { logger: { warn() {}, error() {} } }
  if (request === '@/lib/apiHandler') return { apiHandler: (_options, handler) => handler }
  if (request === '@/lib/api-client/server') return { createClient() { throw new Error('Fixture adapter: no client access after refused admission') } }
  if (request === '@/lib/auth') return { authOptions: {} }
  if (request === '../generators/deedPlan') return { generateDeedPlan() { throw new Error('Synthetic renderer failure') } }
  const resolved = request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request
  return originalLoad.call(this, resolved, parent, ...rest)
}
Module._extensions['.ts'] = function(module, filename) {
  const source = readFileSync(filename, 'utf8'), relative = path.relative(process.cwd(), filename).replaceAll('\\', '/')
  if (relative.startsWith('src/')) report.sourceHashes[relative] = createHash('sha256').update(source).digest('hex')
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
}
const { requireSubmissionAdmission } = require('../src/lib/submission/submissionAdmission.ts')
const { POST: generate } = require('../src/app/api/submission/generate/route.ts')
const { AppError } = require('../src/lib/api/errors.ts')
const { NextRequest } = require('next/server')
const tables = ['users', 'projects', 'profiles', 'surveyor_profiles', 'parcel_traverses', 'traverse_coordinates', 'project_fieldbook_entries', 'parcels', 'submission_documents']
const publicCounts = async () => {
  const counts = {}
  for (const table of tables) counts[table] = (await admin.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n
  return counts
}
const ledger = async () => (await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
const validBoundary = { computation: { source: 'field-observations' }, linear_misclosure: 0.001, perimeter_m: 400, precision_ratio: '1:400000',
  adjustedStations: [[0, 0], [100, 0], [100, 100], [0, 100]].map(([e, n], i) => ({ pointName: `P${i + 1}`, adjustedEasting: e, adjustedNorthing: n })) }
const setBoundary = boundary => pool.query('UPDATE projects SET boundary_data=$2::jsonb WHERE id=$1', [projectId, JSON.stringify(boundary)])
const ready = async () => (await pool.query('SELECT * FROM submission_documents WHERE project_id=$1 ORDER BY document_id', [projectId])).rows
async function check(name, run) {
  try { await run(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`) }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`) }
  save()
}
let created = false
await admin.connect()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  report.ledgerBefore = await ledger(); report.publicCountsBefore = await publicCounts()
  await admin.query(`CREATE SCHEMA ${schema}`); created = true
  await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  // Copy empty table definitions only, never customer rows or applied migrations.
  for (const table of tables) await pool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`)
  await pool.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)', [owner, `${owner}@example.invalid`, 'Synthetic reviewer', 'inert-non-login-fixture'])
  await pool.query('INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,$3,$4)', [projectId, owner, 'SYNTHETIC submission admission only', 'cadastral'])
  await pool.query('INSERT INTO surveyor_profiles(user_id,license_number) VALUES($1,$2)', [owner, 'ISK/LS/2020/123'])
  await pool.query("INSERT INTO submission_documents(project_id,document_id,document_type,status,file_url) VALUES($1,'deed-plan','deed-plan','ready','/synthetic/previous-ready.pdf')", [projectId])
  await check('canonical empty result tables report missing cadastral evidence without SQL errors', async () => {
    await assert.rejects(requireSubmissionAdmission(projectId), error => error instanceof AppError && error.code === 'SUBMISSION_QUALITY_BLOCKED' && !error.details.gate.violations.some(v => v.message.includes('could not be loaded')))
  })
  await check('a retained field-observation computation passes the configured numeric checks', async () => {
    await setBoundary(validBoundary)
    const admission = await requireSubmissionAdmission(projectId)
    assert.equal(admission.gate.passed, true); assert.equal(admission.input.parcels[0].vertices[0].easting, 0)
  })
  await check('missing closure remains unassessed rather than becoming zero', async () => {
    const changed = { ...validBoundary }; delete changed.linear_misclosure
    await setBoundary(changed)
    await assert.rejects(requireSubmissionAdmission(projectId), error => error.code === 'SUBMISSION_QUALITY_BLOCKED')
  })
  await check('refused generation preserves the entire existing ready row', async () => {
    const before = await ready()
    await assert.rejects(generate(new NextRequest('http://127.0.0.1/api/submission/generate'), { userId: owner, body: { projectId, documentId: 'deed-plan' } }), error => error.code === 'SUBMISSION_QUALITY_BLOCKED')
    assert.deepEqual(await ready(), before)
  })
  await check('renderer failure cannot downgrade a previous ready document in native SQL', async () => {
    await setBoundary(validBoundary); const before = await ready()
    const response = await generate(new NextRequest('http://127.0.0.1/api/submission/generate'), { userId: owner, body: { projectId, documentId: 'deed-plan' } })
    assert.equal(response.status, 500); assert.equal((await response.json()).error, 'Synthetic renderer failure')
    assert.deepEqual(await ready(), before)
  })
  await check('canonical PostGIS parcel geometry is read without fabricated boundary columns', async () => {
    await pool.query("INSERT INTO parcels(project_id,parcel_number,geom) VALUES($1,'SYNTHETIC',ST_GeomFromText('POLYGON((0 0,100 0,100 100,0 100,0 0))',21037))", [projectId])
    const admission = await requireSubmissionAdmission(projectId)
    assert.equal(admission.input.parcels.length, 1); assert.equal(admission.input.parcels[0].vertices.length, 4)
    assert.equal(admission.input.parentParcel, undefined)
    await assert.rejects(requireSubmissionAdmission(projectId, 'mutation-form'), error => error.code === 'SUBMISSION_QUALITY_BLOCKED')
  })
} finally {
  await pool.end()
  if (created) {
    assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1", [schema])).rows[0]?.marker, marker)
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    assert.equal((await admin.query('SELECT count(*)::int n FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].n, 0)
    report.fixtureSchemaRemoved = true
  }
  if (report.ledgerBefore) { assert.deepEqual(await ledger(), report.ledgerBefore); report.appliedLedgerUnchanged = true }
  if (report.publicCountsBefore) { assert.deepEqual(await publicCounts(), report.publicCountsBefore); report.publicCountsUnchanged = true }
  for (const [file, hash] of Object.entries(report.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(file, 'utf8')).digest('hex'), hash)
  report.instantiatedSourcesUnchanged = true
  report.status = report.checks.length === 6 && report.checks.every(check => check.passed) ? 'passed' : 'failed'
  save(); await admin.end()
}
process.exitCode = report.status === 'passed' ? 0 : 1
