// Native source acceptance in the exact existing marked synthetic service.
// No production credentials, customer clone, migration or container lifecycle.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const phase = process.argv[2]
assert.ok(['red', 'green'].includes(phase), 'Choose red or green evidence; no database override is accepted.')
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === '--ci'), 'Only the fixed --ci fixture is optional.')
const ci = process.argv[3] === '--ci'
if (ci) assert.equal(process.env.CI, 'true', 'The CI fixture switch is available only in the CI environment.')
const serviceId = 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
const format = '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}'
if (!ci) {
const service = JSON.parse(execFileSync('docker', ['inspect', '--format', format, 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }))
assert.equal(service.Id, serviceId)
assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal')
assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
}
const connectionString = ci
  ? 'postgresql://revision_verify:local_revision_verify_only@127.0.0.1:55432/metardu_revision_verify'
  : 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
const token = randomUUID()
const schema = `metardu_deliverable_verify_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_deliverable_verify_[a-f0-9]{32}$/)
const marker = `METARDU owned deliverable fixture ${token}`
const applicationName = `metardu-deliverable-native-${token}`
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000, max: 5,
  application_name: applicationName, options: `-c search_path=${schema},public` })
const admin = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
const sourceFiles = ['src/lib/deliverables/deliverableRegister.ts', 'src/lib/observations/observationBatches.ts']
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
const beforeSource = sourceHashes()
const report = { phase, mode: ci ? 'CI fixture' : 'owned local synthetic service', source: beforeSource, serviceId: ci ? null : serviceId, schema, checks: [], productionChanged: false, newContainer: false }
const evidenceRoot = ci ? 'test-results/deliverable-register' : '.cache/deliverable-register'
mkdirSync(evidenceRoot, { recursive: true })
const save = () => writeFileSync(`${evidenceRoot}/${phase}.json`, JSON.stringify(report, null, 2) + '\n')
const database = {
  query: (sql, values) => pool.query(sql, values),
  transaction: async work => {
    const client = await pool.connect()
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result }
    catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  },
}
const require = createRequire(import.meta.url)
const Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return { db: database }
  const resolved = request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request
  return originalLoad.call(this, resolved, parent, ...rest)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename)
}
const { registerDeliverable } = require('../src/lib/deliverables/deliverableRegister.ts')
const userId = randomUUID(), projects = Array.from({ length: 8 }, () => randomUUID())
const input = index => ({ projectId: projects[index], documentType: 'csv', content: 'original,0\r\n', userId,
  sourceRevision: 'R01', projectCrs: 'EPSG:32737', generator: 'native-verification', manifest: {} })
async function state(projectId) {
  const deliverables = (await pool.query('SELECT * FROM deliverables WHERE project_id=$1 ORDER BY id', [projectId])).rows
  const revisions = (await pool.query('SELECT r.* FROM deliverable_revisions r JOIN deliverables d ON d.id=r.deliverable_id WHERE d.project_id=$1 ORDER BY r.revision', [projectId])).rows
  const events = (await pool.query('SELECT * FROM evidence_events WHERE project_id=$1 ORDER BY created_at,id', [projectId])).rows
  return { deliverables, revisions, events }
}
async function check(name, work) {
  try { await work(); report.checks.push({ name, passed: true }); console.log('PASS ' + name) }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.log('FAIL ' + name) }
  save()
}
let created = false
await admin.connect()
try {
  if (ci) {
    assert.equal((await admin.query('SELECT current_database() name')).rows[0].name, 'metardu_revision_verify')
    assert.equal((await admin.query("SELECT to_regclass('public.schema_migrations') ledger")).rows[0].ledger, null)
    report.ledgerBefore = []
  } else {
    assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,
      'METARDU synthetic beacon verification only 2026-10-08')
    report.ledgerBefore = (await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  }
  await admin.query(`CREATE SCHEMA ${schema}`)
  created = true
  await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  await pool.query('CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY)')
  await pool.query('INSERT INTO users VALUES($1)', [userId])
  for (const id of projects) await pool.query('INSERT INTO projects VALUES($1)', [id])
  const migration = readFileSync('src/lib/db/migrations/072_deliverables_computations_qa.sql', 'utf8')
  const end = migration.indexOf('-- ─── computation_runs:')
  assert.ok(end > 0)
  await pool.query(migration.slice(0, end))
  await pool.query(`CREATE TABLE evidence_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), project_id uuid REFERENCES projects(id), entity_type text,
    entity_id uuid, event_type text, details jsonb, user_id uuid REFERENCES users(id), event_hash text,
    previous_hash text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION fault_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.manifest->>'fault'='revision' THEN RAISE EXCEPTION 'owned revision fault'; END IF;
      IF NEW.manifest->>'fault'='silent' THEN RETURN NULL; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER owned_revision_fault BEFORE INSERT ON deliverable_revisions FOR EACH ROW EXECUTE FUNCTION fault_revision();
    CREATE FUNCTION fault_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.details->>'generator'='fail-event' THEN RAISE EXCEPTION 'owned evidence fault'; END IF;
      IF NEW.details->>'generator'='silent-event' THEN RETURN NULL; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER owned_evidence_fault BEFORE INSERT ON evidence_events FOR EACH ROW EXECUTE FUNCTION fault_evidence();`)
  await pool.query(`CREATE FUNCTION gate_first_export() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.project_id='${projects[3]}'::uuid THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('${marker}',0));
    END IF; RETURN NEW; END $$;
    CREATE TRIGGER owned_first_export_gate BEFORE INSERT ON deliverables FOR EACH ROW EXECUTE FUNCTION gate_first_export();`)

  await check('failed revision insertion leaves the existing register and evidence unchanged', async () => {
    await registerDeliverable(input(0))
    const before = await state(projects[0])
    await assert.rejects(registerDeliverable({ ...input(0), manifest: { fault: 'revision' }, sourceRevision: 'R02' }))
    assert.deepEqual(await state(projects[0]), before)
  })
  await check('evidence failure rolls back the entire new registration', async () => {
    await assert.rejects(registerDeliverable({ ...input(1), generator: 'fail-event' }))
    assert.deepEqual(await state(projects[1]), { deliverables: [], revisions: [], events: [] })
  })
  await check('silent revision suppression cannot acknowledge an incomplete register', async () => {
    await assert.rejects(registerDeliverable({ ...input(2), manifest: { fault: 'silent' } }))
    assert.deepEqual(await state(projects[2]), { deliverables: [], revisions: [], events: [] })
  })
  await check('concurrent first exports become one register with contiguous immutable revisions', async () => {
    await admin.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [marker])
    const pending = Promise.allSettled([registerDeliverable(input(3)), registerDeliverable({ ...input(3), content: 'later,0\r\n', sourceRevision: 'R02' })])
    let gated = false
    try {
      for (let attempt = 0; attempt < 80; attempt++) {
        const waiting = (await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName])).rows[0].n
        if (waiting === 2) { gated = true; break }
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    } finally { await admin.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [marker]) }
    const settled = await pending
    assert.equal(gated, true, 'Both competing requests must reach the controlled native lock boundary')
    assert.ok(settled.every(result => result.status === 'fulfilled'), 'Both competing exports must register successfully')
    const results = settled.map(result => result.value)
    const saved = await state(projects[3])
    assert.equal(saved.deliverables.length, 1)
    assert.equal(saved.deliverables[0].current_revision, 2)
    assert.deepEqual(saved.revisions.map(row => row.revision), [1, 2])
    assert.equal(saved.events.length, 2)
    assert.deepEqual(results.map(result => result.revision.revision).sort(), [1, 2])
    for (const result of results) assert.equal(result.deliverable.current_revision, result.revision.revision)
  })
  await check('a new revision clears prior approval and updates current source metadata', async () => {
    const first = await registerDeliverable(input(4))
    await pool.query("UPDATE deliverables SET status='APPROVED',reviewed_by=$2,approved_at=now() WHERE id=$1", [first.deliverable.id, userId])
    const next = await registerDeliverable({ ...input(4), sourceRevision: 'R02', content: 'revised,0\r\n' })
    assert.equal(next.deliverable.status, 'IN_REVIEW')
    assert.equal(next.deliverable.reviewed_by, null)
    assert.equal(next.deliverable.approved_at, null)
    assert.equal(next.deliverable.source_revision, 'R02')
    const saved = await state(projects[4])
    assert.equal(saved.revisions[0].content_hash, createHash('sha256').update(input(4).content).digest('hex'))
    assert.equal(saved.revisions[0].source_revision, 'R01')
  })
  await check('returned bytes, hash, manifest and evidence refer to the same revision', async () => {
    const requested = { ...input(5), content: '測量,0\r\n', manifest: { original: true, height: null, zero: 0 } }
    const result = await registerDeliverable(requested)
    assert.equal(Number(result.revision.bytes), Buffer.byteLength(requested.content))
    assert.equal(result.revision.content_hash, createHash('sha256').update(requested.content).digest('hex'))
    assert.deepEqual(result.revision.manifest, requested.manifest)
    const saved = await state(projects[5])
    assert.equal(saved.events[0].details.content_hash, result.revision.content_hash)
    assert.equal(saved.events[0].details.revision, result.revision.revision)
  })
  await check('a missing project cannot leave orphan register state', async () => {
    await assert.rejects(registerDeliverable({ ...input(6), projectId: randomUUID() }))
    assert.deepEqual(await state(projects[6]), { deliverables: [], revisions: [], events: [] })
  })
  await check('silent evidence suppression rolls back the existing register and revision', async () => {
    await registerDeliverable(input(7))
    const before = await state(projects[7])
    await assert.rejects(registerDeliverable({ ...input(7), generator: 'silent-event', sourceRevision: 'R02' }),
      /evidence event was not recorded/)
    assert.deepEqual(await state(projects[7]), before)
  })
} finally {
  await pool.end()
  if (created) {
    const owned = (await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1", [schema])).rows[0]
    assert.equal(owned?.marker, marker, 'Do not remove an unowned schema')
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    assert.equal((await admin.query('SELECT count(*)::int n FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].n, 0)
    report.fixtureSchemaRemoved = true
  }
  const ledger = ci ? [] : (await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  assert.deepEqual(ledger, report.ledgerBefore)
  report.historicalLedgerUnchanged = true
  assert.deepEqual(sourceHashes(), beforeSource)
  report.sourceUnchanged = true
  report.status = report.checks.length === 8 && report.checks.every(check => check.passed) ? 'passed' : 'failed'
  save()
  await admin.end()
}
process.exitCode = report.status === 'passed' ? 0 : 1
