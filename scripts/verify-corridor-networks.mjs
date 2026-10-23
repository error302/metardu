// Actual source handlers + PostgreSQL in the exact owned synthetic service.
// No customer clone, credentials, migration application or container lifecycle.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const phase = process.argv[2]
assert.ok(['red', 'green'].includes(phase))
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === '--ci'), 'Only the fixed --ci fixture is optional.')
const ci = process.argv[3] === '--ci'
if (ci) assert.equal(process.env.CI, 'true', 'The CI switch requires the CI environment.')
const serviceId = 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
if (!ci) {
const service = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
assert.equal(service.Id, serviceId)
assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal')
assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
}
const connectionString = ci
  ? 'postgresql://revision_verify:local_revision_verify_only@127.0.0.1:55432/metardu_revision_verify'
  : 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
const token = randomUUID(), schema = `metardu_corridor_verify_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_corridor_verify_[a-f0-9]{32}$/)
const marker = `METARDU owned corridor fixture ${token}`, applicationName = `metardu-corridor-native-${token}`
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000, max: 5,
  application_name: applicationName, options: `-c search_path=${schema},public` })
const admin = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
const sourceFiles = ['src/app/api/corridor-networks/route.ts', 'src/lib/validation/declaredUtmReference.ts', 'src/lib/db/migrations/045_corridor_control_networks.sql']
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
const beforeSource = sourceHashes()
const report = { phase, source: beforeSource, serviceId: ci ? null : serviceId, mode: ci ? 'CI fixture' : 'owned local synthetic service', schema, checks: [], productionChanged: false, newContainer: false }
const evidenceRoot = ci ? 'test-results/corridor-networks' : '.cache/corridor-networks'
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
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return { db: database }
  if (request === '@/lib/apiHandler') return { apiHandler: (options, handler) => async (body, userId) => handler(undefined, { body: options.schema.parse(body), userId }) }
  const resolved = request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request
  return originalLoad.call(this, resolved, parent, ...rest)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename)
}
const { POST: create } = require('../src/app/api/corridor-networks/route.ts')
const owner = randomUUID(), other = randomUUID()
const body = (name, control_points = []) => ({ name, epsg_code: 'EPSG:32632', control_points })
const point = (point_name, elevation) => ({ point_name, easting: 500000, northing: 5800000, ...(elevation === undefined ? {} : { elevation }) })
async function state(name) {
  return {
    networks: (await pool.query('SELECT * FROM corridor_control_networks WHERE name=$1 ORDER BY version,id', [name])).rows,
    points: (await pool.query('SELECT p.* FROM corridor_control_points p JOIN corridor_control_networks n ON n.id=p.network_id WHERE n.name=$1 ORDER BY n.version,p.point_name', [name])).rows,
  }
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
  await pool.query('CREATE TABLE users(id uuid PRIMARY KEY)')
  await pool.query('INSERT INTO users VALUES($1),($2)', [owner, other])
  const migration = readFileSync('src/lib/db/migrations/045_corridor_control_networks.sql', 'utf8')
  const end = migration.indexOf('-- ─── Contractor Submissions')
  assert.ok(end > 0)
  await pool.query(migration.slice(0, end))
  await pool.query(`CREATE FUNCTION fault_header() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.name='silent-header' AND NEW.version>1 THEN RETURN NULL; END IF;
    IF NEW.name='concurrent' THEN PERFORM pg_advisory_xact_lock(hashtextextended('${marker}',0)); END IF;
    RETURN NEW; END $$;
    CREATE TRIGGER owned_header_fault BEFORE INSERT ON corridor_control_networks FOR EACH ROW EXECUTE FUNCTION fault_header();
    CREATE FUNCTION fault_point() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.point_name='FAULT' THEN RAISE EXCEPTION 'owned point insertion fault'; END IF;
      IF NEW.point_name='SILENT' THEN RETURN NULL; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER owned_point_fault BEFORE INSERT ON corridor_control_points FOR EACH ROW EXECUTE FUNCTION fault_point();
    CREATE FUNCTION fault_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF OLD.name='silent-update' THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER owned_update_fault BEFORE UPDATE ON corridor_control_networks FOR EACH ROW EXECUTE FUNCTION fault_update()`)

  await check('failed point insertion preserves the complete prior version', async () => {
    await create(body('point-failure', [point('ORIGINAL', 0)]), owner)
    const before = await state('point-failure')
    await assert.rejects(create(body('point-failure', [point('FIRST', -1), point('FAULT', 0)]), owner))
    assert.deepEqual(await state('point-failure'), before)
  })
  await check('another user cannot replace an existing named network', async () => {
    await create(body('owner-protection', [point('ORIGINAL', 0)]), owner)
    const before = await state('owner-protection')
    await assert.rejects(create(body('owner-protection'), other), error => error.statusCode === 403)
    assert.deepEqual(await state('owner-protection'), before)
  })
  await check('silent point suppression rolls back the entire new version', async () => {
    await create(body('silent-point'), owner)
    const before = await state('silent-point')
    await assert.rejects(create(body('silent-point', [point('SILENT', 0)]), owner))
    assert.deepEqual(await state('silent-point'), before)
  })
  await check('silent header suppression cannot deactivate the previous version', async () => {
    await create(body('silent-header'), owner)
    const before = await state('silent-header')
    await assert.rejects(create(body('silent-header'), owner))
    assert.deepEqual(await state('silent-header'), before)
  })
  await check('silent deactivation cannot leave two active versions', async () => {
    await create(body('silent-update'), owner)
    const before = await state('silent-update')
    await assert.rejects(create(body('silent-update'), owner))
    assert.deepEqual(await state('silent-update'), before)
  })
  await check('simultaneous first versions serialize into one ordered active chain', async () => {
    await admin.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [marker])
    const work = Promise.allSettled([create(body('concurrent', [point('A', 0)]), owner), create(body('concurrent', [point('B', -1)]), owner)])
    let bothWaiting = false
    try {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const waiting = (await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName])).rows[0].n
        if (waiting >= 2) { bothWaiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    } finally { await admin.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [marker]) }
    const settled = await work
    assert.equal(bothWaiting, true, 'Both requests must reach the deterministic contention gate')
    assert.ok(settled.every(result => result.status === 'fulfilled'), JSON.stringify(settled))
    const saved = await state('concurrent')
    assert.deepEqual(saved.networks.map(row => row.version), [1, 2])
    assert.deepEqual(saved.networks.map(row => row.is_active), [false, true])
    assert.equal(saved.networks[1].parent_version_id, saved.networks[0].id)
    assert.equal(saved.points.length, 2)
  })
  await check('explicit reference and zero negative unknown heights survive native SQL', async () => {
    const response = await create(body('native-values', [point('ZERO', 0), point('NEGATIVE', -1), point('UNKNOWN')]), owner)
    assert.equal(response.status, 201)
    const saved = await state('native-values'), row = saved.networks[0]
    assert.equal(row.epsg_code, 'EPSG:32632'); assert.equal(row.utm_zone, 32); assert.equal(row.hemisphere, 'N'); assert.equal(row.datum, 'WGS 84')
    assert.deepEqual(saved.points.map(point => [point.point_name, point.elevation]), [['NEGATIVE', -1], ['UNKNOWN', null], ['ZERO', 0]])
  })
  await check('ambiguous historical head versions require review before mutation', async () => {
    await create(body('ambiguous-head'), owner)
    await pool.query(`INSERT INTO corridor_control_networks(name,version,created_by) VALUES('ambiguous-head',1,$1)`, [owner])
    const before = await state('ambiguous-head')
    await assert.rejects(create(body('ambiguous-head'), owner), error => error.statusCode === 409)
    assert.deepEqual(await state('ambiguous-head'), before)
  })
  await check('distinct historical active heads cannot be carried into another version', async () => {
    await create(body('multiple-active'), owner)
    await pool.query("INSERT INTO corridor_control_networks(name,version,created_by,is_active) VALUES('multiple-active',2,$1,TRUE)", [owner])
    const before = await state('multiple-active')
    await assert.rejects(create(body('multiple-active'), owner), error => error.statusCode === 409)
    assert.deepEqual(await state('multiple-active'), before)
  })
  await check('an older active head cannot survive replacement of a newer inactive version', async () => {
    await create(body('inactive-latest'), owner)
    await pool.query("INSERT INTO corridor_control_networks(name,version,created_by,is_active) VALUES('inactive-latest',2,$1,FALSE)", [owner])
    const before = await state('inactive-latest')
    await assert.rejects(create(body('inactive-latest'), owner), error => error.statusCode === 409)
    assert.deepEqual(await state('inactive-latest'), before)
  })
} finally {
  await pool.end()
  if (created) {
    assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1", [schema])).rows[0]?.marker, marker, 'Do not remove an unowned schema')
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    assert.equal((await admin.query('SELECT count(*)::int n FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].n, 0)
    report.fixtureSchemaRemoved = true
  }
  if (ci) assert.equal((await admin.query("SELECT to_regclass('public.schema_migrations') ledger")).rows[0].ledger, null)
  else assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows, report.ledgerBefore)
  report.historicalLedgerUnchanged = true
  assert.deepEqual(sourceHashes(), beforeSource); report.sourceUnchanged = true
  report.status = report.checks.length === 10 && report.checks.every(check => check.passed) ? 'passed' : 'failed'
  save(); await admin.end()
}
process.exitCode = report.status === 'passed' ? 0 : 1
